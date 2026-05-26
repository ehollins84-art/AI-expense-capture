import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '../components/Screen';
import { Pressable } from '../components/Pressable';
import { ExtractingState } from '../components/ExtractingState';
import { DatePickerModal } from '../components/DatePickerModal';
import { theme } from '../lib/theme';
import { useStore, useActiveProject } from '../lib/store';
import { categoriesForProject } from '../lib/categories';
import { extractReceipt, claudeConfigured } from '../lib/claude';
import { formatDate } from '../lib/format';
import { haptic } from '../lib/haptics';
import { signalReceiptSaved } from '../lib/uiSignals';
import type { ExtractedReceipt } from '../lib/types';

type Phase = 'picking' | 'extracting' | 'review' | 'saving';

export default function AddExpense() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const { saveExpenseAndSync, projects } = useStore();
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
      try {
        const fromLibrary = source === 'library';
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setDate(new Date().toISOString().slice(0, 10));
      setCategory(categoriesForProject(active)[0] ?? '');
    } finally {
      setPhase('review');
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            {projects.length > 1 && active && (
              <Text style={styles.projectTag} numberOfLines={1}>
                {active.name}
              </Text>
            )}
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

          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Home Depot - Painting Supplies"
          />

          <Text style={styles.fieldLabel}>Date</Text>
          <Pressable
            style={styles.dateButton}
            hapticOnPress="select"
            scaleTo={1}
            onPress={() => setDatePickerOpen(true)}
          >
            <Text
              style={[
                styles.dateButtonText,
                !date && { color: theme.colors.textSubtle },
              ]}
            >
              {date ? formatDate(date) : 'Pick a date'}
            </Text>
            <Text style={styles.dateButtonGlyph}>›</Text>
          </Pressable>

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {cats.map((c) => (
              <Pressable
                key={c}
                hapticOnPress="select"
                onPress={() => setCategory(c)}
                style={[
                  styles.catChip,
                  c === category && styles.catChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.catChipText,
                    c === category && styles.catChipTextActive,
                  ]}
                >
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.amountRow}>
            <View style={{ flex: 2 }}>
              <Field
                label="Amount"
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
              <Field
                label="Currency"
                value={currency}
                onChangeText={setCurrency}
                placeholder="USD"
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View style={{ height: theme.spacing.xxl }} />
        </ScrollView>

        <DatePickerModal
          visible={datePickerOpen}
          initialDate={date || new Date().toISOString().slice(0, 10)}
          onSubmit={(iso) => {
            setDate(iso);
            setDatePickerOpen(false);
          }}
          onDismiss={() => setDatePickerOpen(false)}
        />

        <View style={styles.bottomBar}>
          <Pressable
            style={[
              styles.lookGoodBtn,
              phase === 'saving' && { opacity: 0.5 },
            ]}
            disabled={phase === 'saving'}
            hapticOnPress="light"
            onPress={handleSave}
          >
            <Text style={styles.lookGoodText}>
              {phase === 'saving' ? 'Saving…' : 'Looks good'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  catChipText: { ...theme.type.label, color: theme.colors.text },
  catChipTextActive: { color: '#fff' },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start' },
  bottomBar: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  lookGoodBtn: {
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  lookGoodText: { color: theme.colors.bg, ...theme.type.bodyStrong },
});
