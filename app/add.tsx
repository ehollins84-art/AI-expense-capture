import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '../components/Screen';
import { KeyboardAwareFooter } from '../components/KeyboardAwareFooter';
import { Pressable } from '../components/Pressable';
import { ExtractingState } from '../components/ExtractingState';
import { DatePickerModal } from '../components/DatePickerModal';
import { CategoryPromptModal } from '../components/CategoryPromptModal';
import { BlinkingCursor } from '../components/BlinkingCursor';
import { theme } from '../lib/theme';
import { useStore, useActiveProject } from '../lib/store';
import { categoriesForProject } from '../lib/categories';
import { extractReceipt, claudeConfigured } from '../lib/claude';
import { formatDate } from '../lib/format';
import { haptic } from '../lib/haptics';
import { ensureCameraPermission, ensureLibraryPermission } from '../lib/permissions';
import { signalReceiptSaved } from '../lib/uiSignals';
import type { ExtractedReceipt } from '../lib/types';

type Phase = 'picking' | 'extracting' | 'review' | 'saving';
type RevealStep = 'title' | 'date' | 'category' | 'amount' | 'done';
type Reveal = {
  step: RevealStep;
  typedTitle: string;
  typedAmount: string;
};

const CHAR_MS = 10;
const STEP_PAUSE_MS = 75;
const STEP_HOLD_MS = 140;

export default function AddExpense() {
  const router = useRouter();
  const { source, imageUri: pickedImageUri } = useLocalSearchParams<{
    source?: string;
    imageUri?: string;
  }>();
  const { saveExpenseAndSync, addProjectCategory, projects } = useStore();
  const active = useActiveProject();
  const [phase, setPhase] = useState<Phase>('picking');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  const pickedRef = useRef(false);

  useEffect(() => {
    if (pickedRef.current) return;
    pickedRef.current = true;
    (async () => {
      if (source === 'manual') {
        if (active) {
          setDate(new Date().toISOString().slice(0, 10));
          setCategory(categoriesForProject(active)[0] ?? '');
        }
        setPhase('review');
        return;
      }
      // A photo was already chosen in the import sheet — skip the picker and
      // go straight to extraction.
      if (source === 'picked' && pickedImageUri) {
        setImageUri(pickedImageUri);
        await runExtraction(pickedImageUri);
        return;
      }
      try {
        const fromLibrary = source === 'library';
        const granted = fromLibrary
          ? await ensureLibraryPermission()
          : await ensureCameraPermission();
        if (!granted) {
          router.back();
          return;
        }
        const result = fromLibrary
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.85,
              allowsEditing: false,
            })
          : await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.85,
              allowsEditing: false,
            });

        if (result.canceled) {
          router.back();
          return;
        }
        const uri = result.assets[0].uri;
        setImageUri(uri);
        await runExtraction(uri);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase('review');
      }
    })();
  }, [source, active]);

  useEffect(() => {
    if (!reveal) return;
    if (reveal.step === 'title') {
      if (reveal.typedTitle.length < title.length) {
        const t = setTimeout(
          () =>
            setReveal({
              ...reveal,
              typedTitle: title.slice(0, reveal.typedTitle.length + 1),
            }),
          CHAR_MS,
        );
        return () => clearTimeout(t);
      }
      const t = setTimeout(
        () => setReveal({ ...reveal, step: 'date' }),
        STEP_PAUSE_MS,
      );
      return () => clearTimeout(t);
    }
    if (reveal.step === 'date') {
      const t = setTimeout(
        () => setReveal({ ...reveal, step: 'category' }),
        STEP_HOLD_MS,
      );
      return () => clearTimeout(t);
    }
    if (reveal.step === 'category') {
      const t = setTimeout(
        () => setReveal({ ...reveal, step: 'amount' }),
        STEP_HOLD_MS,
      );
      return () => clearTimeout(t);
    }
    if (reveal.step === 'amount') {
      if (reveal.typedAmount.length < amount.length) {
        const t = setTimeout(
          () =>
            setReveal({
              ...reveal,
              typedAmount: amount.slice(0, reveal.typedAmount.length + 1),
            }),
          CHAR_MS,
        );
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setReveal(null), STEP_PAUSE_MS);
      return () => clearTimeout(t);
    }
  }, [reveal, title, amount]);

  function skipReveal() {
    if (reveal) {
      haptic.select();
      setReveal(null);
    }
  }

  // A field is "revealed" if there's no reveal in progress, or if the current
  // reveal step is at or past that field. During its own step, special
  // behavior takes over (typing, flash, chip pop).
  const stepRank: Record<RevealStep, number> = {
    title: 0,
    date: 1,
    category: 2,
    amount: 3,
    done: 4,
  };
  const at = (s: RevealStep) =>
    !reveal || stepRank[reveal.step] >= stepRank[s];
  const dateShown = at('date') ? date : '';
  const categoryShown = at('category') ? category : '';
  const amountShown = at('amount') ? amount : '';

  async function runExtraction(uri: string) {
    if (!active) {
      setError('No active project. Create one first.');
      setPhase('review');
      return;
    }
    if (!claudeConfigured()) {
      setError(
        'No AI key set up — fill in the details by hand for now.',
      );
      setDate(new Date().toISOString().slice(0, 10));
      setCategory(categoriesForProject(active)[0] ?? '');
      setPhase('review');
      return;
    }
    setPhase('extracting');
    setError(null);
    try {
      const cats = categoriesForProject(active);
      const data: ExtractedReceipt = await extractReceipt(uri, cats);
      setTitle(data.title);
      setDate(data.date);
      setCategory(
        cats.includes(data.category) ? data.category : cats[0] ?? '',
      );
      setAmount(data.amount.toString());
      setCurrency(data.currency || 'USD');
      setReveal({ step: 'title', typedTitle: '', typedAmount: '' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setDate(new Date().toISOString().slice(0, 10));
      setCategory(categoriesForProject(active)[0] ?? '');
    } finally {
      setPhase('review');
    }
  }

  // Add a category on the fly from the expense form, then select it.
  async function handleAddCategory(name: string) {
    if (!active) return;
    setNewCatOpen(false);
    try {
      const updated = await addProjectCategory(active, name);
      // Match the canonical stored casing/trim in case it was normalized.
      const stored =
        categoriesForProject(updated).find(
          (c) => c.toLowerCase() === name.trim().toLowerCase(),
        ) ?? name.trim();
      setCategory(stored);
      haptic.success();
    } catch (e) {
      haptic.warning();
      Alert.alert('Couldn\'t add', e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSave() {
    if (!active) return;
    const parsedAmount = parseFloat(amount);
    if (!title.trim() || !date.trim() || !category.trim() || isNaN(parsedAmount)) {
      Alert.alert('Missing info', 'Please fill out every field before saving.');
      return;
    }
    setPhase('saving');
    try {
      await saveExpenseAndSync(
        {
          projectId: active.id,
          title: title.trim(),
          date,
          category,
          amount: parsedAmount,
          currency: currency.trim() || 'USD',
        },
        imageUri,
      );
      haptic.success();
      signalReceiptSaved();
      router.back();
    } catch (e) {
      haptic.error();
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', msg);
      setPhase('review');
    }
  }

  async function attachPhoto(fromLibrary: boolean) {
    try {
      const granted = fromLibrary
        ? await ensureLibraryPermission()
        : await ensureCameraPermission();
      if (!granted) return;
      const result = fromLibrary
        ? await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            allowsEditing: false,
          })
        : await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            allowsEditing: false,
          });
      if (result.canceled) return;
      setImageUri(result.assets[0].uri);
      haptic.success();
    } catch (e) {
      haptic.error();
      Alert.alert(
        'Couldn\'t attach photo',
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  function offerAttachPhoto() {
    Alert.alert('Attach a photo', undefined, [
      { text: 'Take photo', onPress: () => attachPhoto(false) },
      { text: 'Pick from library', onPress: () => attachPhoto(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (phase === 'picking') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (phase === 'extracting') {
    return (
      <Screen>
        <ExtractingState imageUri={imageUri} />
      </Screen>
    );
  }

  const cats = active ? categoriesForProject(active) : [];

  return (
    <Screen edges={['top']}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={120}
      >
          <View style={styles.topBar}>
            <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            {reveal ? (
              <Pressable
                onPress={skipReveal}
                hapticOnPress="select"
                hitSlop={10}
                scaleTo={1}
                style={styles.skipPill}
              >
                <Text style={styles.skipPillText}>Skip ›</Text>
              </Pressable>
            ) : projects.length > 1 && active ? (
              <Text style={styles.projectTag} numberOfLines={1}>
                {active.name}
              </Text>
            ) : null}
          </View>

          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.preview}
              contentFit="cover"
            />
          ) : (
            <Pressable
              style={styles.noReceipt}
              onPress={offerAttachPhoto}
              hapticOnPress="select"
              scaleTo={0.98}
            >
              <View style={styles.noReceiptIcon}>
                <View style={styles.noReceiptIconBar} />
                <View style={styles.noReceiptIconBar} />
                <View style={[styles.noReceiptIconBar, { width: '60%' }]} />
              </View>
              <Text style={styles.noReceiptTitle}>No receipt attached</Text>
              <Text style={styles.noReceiptHint}>Tap to add a photo</Text>
            </Pressable>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Text style={styles.fieldLabel}>Title</Text>
          {reveal && reveal.step === 'title' ? (
            <View style={[styles.input, styles.typingRow]}>
              <Text style={styles.typingText} numberOfLines={1}>
                {reveal.typedTitle}
              </Text>
              <BlinkingCursor height={22} />
            </View>
          ) : (
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Home Depot - Painting Supplies"
              placeholderTextColor={theme.colors.textSubtle}
              style={[styles.input, { marginBottom: theme.spacing.md }]}
              editable={!reveal}
            />
          )}

          <Text style={styles.fieldLabel}>Date</Text>
          <Pressable
            style={[
              styles.dateButton,
              reveal?.step === 'date' && styles.dateButtonRevealing,
            ]}
            hapticOnPress="select"
            scaleTo={1}
            disabled={!!reveal}
            onPress={() => setDatePickerOpen(true)}
          >
            <Text
              style={[
                styles.dateButtonText,
                !dateShown && { color: theme.colors.textSubtle },
              ]}
            >
              {dateShown ? formatDate(dateShown) : 'Pick a date'}
            </Text>
            {reveal?.step === 'date' ? (
              <BlinkingCursor height={20} />
            ) : (
              <Text style={styles.dateButtonGlyph}>›</Text>
            )}
          </Pressable>

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {cats.map((c) => {
              const isActive = c === categoryShown;
              const isPopping = reveal?.step === 'category' && isActive;
              return (
                <Pressable
                  key={c}
                  hapticOnPress="select"
                  disabled={!!reveal}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.catChip,
                    isActive && styles.catChipActive,
                    isPopping && styles.catChipPopping,
                  ]}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      isActive && styles.catChipTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              );
            })}
            {/* Add a category on the fly if the one you want isn't listed. */}
            <Pressable
              hapticOnPress="select"
              disabled={!!reveal}
              onPress={() => setNewCatOpen(true)}
              style={[styles.catChip, styles.catChipNew]}
            >
              <Text style={styles.catChipNewText}>+ New</Text>
            </Pressable>
          </View>

          <View style={styles.amountRow}>
            <View style={{ flex: 2 }}>
              <Text style={styles.fieldLabel}>Amount</Text>
              {reveal && reveal.step === 'amount' ? (
                <View style={[styles.input, styles.typingRow]}>
                  <Text style={styles.typingText} numberOfLines={1}>
                    {reveal.typedAmount}
                  </Text>
                  <BlinkingCursor height={22} />
                </View>
              ) : (
                <TextInput
                  value={amountShown}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textSubtle}
                  keyboardType="decimal-pad"
                  style={[styles.input, { marginBottom: theme.spacing.md }]}
                  editable={!reveal}
                />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
              <Field
                label="Currency"
                value={currency}
                onChangeText={setCurrency}
                placeholder="USD"
                autoCapitalize="characters"
                editable={!reveal}
              />
            </View>
          </View>

          <View style={{ height: theme.spacing.xxl }} />
      </KeyboardAwareScrollView>

      <DatePickerModal
        visible={datePickerOpen}
        initialDate={date || new Date().toISOString().slice(0, 10)}
        onSubmit={(iso) => {
          setDate(iso);
          setDatePickerOpen(false);
        }}
        onDismiss={() => setDatePickerOpen(false)}
      />

      <CategoryPromptModal
        visible={newCatOpen}
        title="New category"
        confirmLabel="Add"
        onSubmit={handleAddCategory}
        onDismiss={() => setNewCatOpen(false)}
      />

      <KeyboardAwareFooter>
        <Pressable
          style={[
            styles.lookGoodBtn,
            (phase === 'saving' || !!reveal) && { opacity: 0.4 },
          ]}
          disabled={phase === 'saving' || !!reveal}
          hapticOnPress="light"
          onPress={handleSave}
        >
          <Text style={styles.lookGoodText}>
            {phase === 'saving' ? 'Saving…' : 'Looks good'}
          </Text>
        </Pressable>
      </KeyboardAwareFooter>
    </Screen>
  );
}

function Field({
  label,
  ...rest
}: {
  label: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        style={styles.input}
        placeholderTextColor={theme.colors.textSubtle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  cancelBtn: { padding: 4 },
  cancelText: { ...theme.type.body, color: theme.colors.textMuted },
  skipPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  skipPillText: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  typingText: {
    ...theme.type.body,
    color: theme.colors.text,
    flexShrink: 1,
  },
  projectTag: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  preview: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceAlt,
    marginBottom: theme.spacing.lg,
  },
  noReceipt: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  noReceiptIcon: {
    width: 38,
    gap: 4,
    marginBottom: theme.spacing.md,
  },
  noReceiptIconBar: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.textSubtle,
    width: '100%',
  },
  noReceiptTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  noReceiptHint: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  errorText: {
    ...theme.type.body,
    color: theme.colors.danger,
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    ...theme.type.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: theme.spacing.md,
  },
  dateButtonRevealing: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  dateButtonText: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  dateButtonGlyph: {
    fontSize: 22,
    color: theme.colors.textSubtle,
    marginTop: -2,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  catChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  catChipPopping: {
    transform: [{ scale: 1.08 }],
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 4,
  },
  catChipText: { ...theme.type.label, color: theme.colors.text },
  catChipTextActive: { color: '#fff' },
  catChipNew: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: theme.colors.accent,
  },
  catChipNewText: { ...theme.type.label, color: theme.colors.accent, fontWeight: '600' },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start' },
  lookGoodBtn: {
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  lookGoodText: { color: theme.colors.bg, ...theme.type.bodyStrong },
});
