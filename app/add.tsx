import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
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
import * as Haptics from 'expo-haptics';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Screen } from '../components/Screen';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { theme } from '../lib/theme';
import { useStore, useActiveProject } from '../lib/store';
import { categoriesForProject } from '../lib/categories';
import { extractReceipt, claudeConfigured } from '../lib/claude';
import { formatDate } from '../lib/format';
import type { ExtractedReceipt } from '../lib/types';

type Phase = 'picking' | 'extracting' | 'review' | 'saving' | 'saved';

const EXTRACT_PHASES = [
  'Reading the receipt…',
  'Identifying merchant…',
  'Pulling line items…',
  'Categorizing for Schedule E…',
];

export default function AddExpense() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const { saveExpenseAndSync } = useStore();
  const active = useActiveProject();
  const [phase, setPhase] = useState<Phase>('picking');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Track which fields were AI-suggested vs. user-edited so we can show
  // the sparkle affordance.
  const [aiTouched, setAiTouched] = useState<Set<string>>(new Set());

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');

  const pickedRef = useRef(false);

  useEffect(() => {
    if (pickedRef.current) return;
    pickedRef.current = true;
    (async () => {
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
  }, [source]);

  async function runExtraction(uri: string) {
    if (!active) {
      setError('No active project. Create one first.');
      setPhase('review');
      return;
    }
    if (!claudeConfigured()) {
      setError(
        'No Anthropic API key configured. Fill the form manually or add EXPO_PUBLIC_ANTHROPIC_API_KEY.',
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
      const resolvedCategory = cats.includes(data.category)
        ? data.category
        : cats[0] ?? '';
      setTitle(data.title);
      setDate(data.date);
      setCategory(resolvedCategory);
      setAmount(data.amount.toString());
      setCurrency(data.currency || 'USD');
      setAiTouched(new Set(['title', 'date', 'category', 'amount']));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setDate(new Date().toISOString().slice(0, 10));
      setCategory(categoriesForProject(active)[0] ?? '');
    } finally {
      setPhase('review');
    }
  }

  function markUserEdited(field: string) {
    if (!aiTouched.has(field)) return;
    setAiTouched((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function handleSave() {
    if (!active || !imageUri) return;
    const parsedAmount = parseFloat(amount);
    if (
      !title.trim() ||
      !date.trim() ||
      !category.trim() ||
      isNaN(parsedAmount)
    ) {
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase('saved');
      setTimeout(() => router.replace('/'), 650);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', msg);
      setPhase('review');
    }
  }

  function confirmDiscard() {
    const dirty =
      title.trim() || amount.trim() || (date && date !== new Date().toISOString().slice(0, 10));
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert('Discard receipt?', 'Your changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  if (phase === 'picking') {
    return (
      <Screen>
        <View style={styles.centered}>
          <Animated.View
            entering={FadeIn.duration(300)}
            style={styles.pickingPulse}
          />
          <Text style={styles.pickingText}>Opening camera…</Text>
        </View>
      </Screen>
    );
  }

  if (phase === 'extracting' && imageUri) {
    return <ExtractingView imageUri={imageUri} />;
  }

  const cats = active ? categoriesForProject(active) : [];

  function onDateChange(_e: DateTimePickerEvent, picked?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (picked) {
      setDate(picked.toISOString().slice(0, 10));
      markUserEdited('date');
    }
  }

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable
            haptic="selection"
            style={styles.topIconBtn}
            onPress={confirmDiscard}
          >
            <Icon name="x" size={20} color={theme.colors.text} />
          </Pressable>
          <View style={styles.eyebrowStack}>
            <Text style={styles.modalEyebrow}>New expense</Text>
            {active && (
              <Text style={styles.modalProject} numberOfLines={1}>
                {active.name}
              </Text>
            )}
          </View>
          <View style={styles.topIconBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {imageUri && (
            <Animated.View entering={FadeInDown.duration(360).springify()}>
              <Image
                source={{ uri: imageUri }}
                style={styles.preview}
                contentFit="cover"
              />
            </Animated.View>
          )}

          {error && (
            <View style={styles.errorCard}>
              <Icon name="x" size={16} color={theme.colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.metaCard}>
            <InlineField
              label="Merchant"
              icon="tag"
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                markUserEdited('title');
              }}
              placeholder="Home Depot – Painting Supplies"
              aiSuggested={aiTouched.has('title')}
            />
            <View style={styles.rowDivider} />
            <Pressable
              haptic="selection"
              style={styles.row}
              onPress={() => setShowDatePicker((s) => !s)}
            >
              <View style={styles.rowLabelGroup}>
                <Icon name="calendar" size={14} color={theme.colors.textSubtle} />
                <Text style={styles.rowLabel}>Date</Text>
              </View>
              <View style={styles.rowValueGroup}>
                {aiTouched.has('date') && <SparkleDot />}
                <Text style={styles.rowValue}>
                  {date ? formatDate(date) : 'Pick date'}
                </Text>
              </View>
            </Pressable>
            {showDatePicker && (
              <View style={styles.datePickerWrap}>
                <DateTimePicker
                  value={date ? new Date(date) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={onDateChange}
                  themeVariant="light"
                />
                {Platform.OS === 'ios' && (
                  <Pressable
                    haptic="selection"
                    style={styles.datePickerDone}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.datePickerDoneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
            <View style={styles.rowDivider} />
            <View style={styles.amountSection}>
              <View style={styles.rowLabelGroup}>
                <Text style={styles.rowLabel}>Amount</Text>
                {aiTouched.has('amount') && <SparkleDot />}
              </View>
              <View style={styles.amountInputRow}>
                <TextInput
                  value={amount}
                  onChangeText={(v) => {
                    setAmount(v);
                    markUserEdited('amount');
                  }}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textSubtle}
                  keyboardType="decimal-pad"
                  style={styles.amountInput}
                />
                <TextInput
                  value={currency}
                  onChangeText={setCurrency}
                  placeholder="USD"
                  placeholderTextColor={theme.colors.textSubtle}
                  autoCapitalize="characters"
                  maxLength={3}
                  style={styles.currencyInput}
                />
              </View>
              {amount && !isNaN(parseFloat(amount)) && (
                <Money
                  amount={parseFloat(amount)}
                  currency={currency}
                  size="body"
                  color={theme.colors.textSubtle}
                  style={{ marginTop: 4 }}
                />
              )}
            </View>
          </View>

          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <Text style={styles.sectionLabel}>Category</Text>
              {aiTouched.has('category') && <SparkleDot />}
            </View>
            <FlatList
              horizontal
              data={cats}
              keyExtractor={(c) => c}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: theme.spacing.lg }}
              ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
              renderItem={({ item: c }) => (
                <Pressable
                  haptic="selection"
                  onPress={() => {
                    setCategory(c);
                    markUserEdited('category');
                  }}
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
              )}
            />
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable
            haptic="medium"
            disabled={phase === 'saving' || phase === 'saved'}
            onPress={handleSave}
            style={[
              styles.cta,
              phase === 'saved' && styles.ctaSuccess,
              phase === 'saving' && { opacity: 0.6 },
            ]}
          >
            {phase === 'saved' ? (
              <Animated.View entering={FadeIn.duration(200)}>
                <Icon name="check" size={22} color="#fff" />
              </Animated.View>
            ) : (
              <Text style={styles.ctaText}>
                {phase === 'saving' ? 'Saving…' : 'Looks good'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function InlineField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  aiSuggested,
}: {
  label: string;
  icon: React.ComponentProps<typeof Icon>['name'];
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  aiSuggested: boolean;
}) {
  return (
    <View style={styles.inlineFieldRow}>
      <View style={styles.rowLabelGroup}>
        <Icon name={icon} size={14} color={theme.colors.textSubtle} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.inlineFieldInputWrap}>
        {aiSuggested && <SparkleDot />}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSubtle}
          style={styles.inlineFieldInput}
          returnKeyType="done"
        />
      </View>
    </View>
  );
}

function SparkleDot() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
  }, [pulse]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.5,
    transform: [{ scale: 0.92 + pulse.value * 0.16 }],
  }));
  return (
    <Animated.View style={[styles.sparkleDot, animStyle]}>
      <Icon name="sparkle" size={10} color={theme.colors.accent} />
    </Animated.View>
  );
}

function ExtractingView({ imageUri }: { imageUri: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    Haptics.selectionAsync();
    return () => cancelAnimation(sweep);
  }, [sweep]);

  useEffect(() => {
    const id = setInterval(
      () => setStepIdx((i) => (i + 1) % EXTRACT_PHASES.length),
      900,
    );
    return () => clearInterval(id);
  }, []);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: -50 + sweep.value * 400,
      },
    ],
    opacity: sweep.value < 0.05 || sweep.value > 0.95 ? 0 : 0.85,
  }));

  return (
    <Screen>
      <View style={styles.extractWrap}>
        <Animated.View
          entering={FadeIn.duration(280)}
          style={styles.extractImageWrap}
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.extractImage}
            contentFit="cover"
          />
          <Animated.View style={[styles.scanLine, sweepStyle]} />
          <View style={styles.scanCornerTL} />
          <View style={styles.scanCornerTR} />
          <View style={styles.scanCornerBL} />
          <View style={styles.scanCornerBR} />
        </Animated.View>
        <View style={styles.extractStatusRow}>
          <Icon name="sparkle" size={14} color={theme.colors.accent} />
          <Animated.Text
            key={stepIdx}
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(120)}
            style={styles.extractStatusText}
          >
            {EXTRACT_PHASES[stepIdx]}
          </Animated.Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pickingPulse: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.accentSoft,
  },
  pickingText: {
    ...theme.type.body,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  topIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrowStack: { alignItems: 'center', flex: 1 },
  modalEyebrow: {
    ...theme.type.eyebrow,
    color: theme.colors.textSubtle,
  },
  modalProject: {
    ...theme.type.label,
    color: theme.colors.text,
    marginTop: 2,
    maxWidth: 220,
  },
  scroll: { padding: theme.spacing.lg, paddingTop: theme.spacing.md },
  preview: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceAlt,
    marginBottom: theme.spacing.lg,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF6F4',
    borderColor: theme.colors.danger,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    ...theme.type.body,
    color: theme.colors.danger,
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  metaCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    paddingHorizontal: theme.spacing.md,
    ...theme.shadow.card,
  },
  inlineFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  inlineFieldInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  inlineFieldInput: {
    ...theme.type.body,
    color: theme.colors.text,
    textAlign: 'right',
    flex: 1,
    paddingVertical: 0,
    marginLeft: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  rowLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowLabel: { ...theme.type.label, color: theme.colors.textMuted },
  rowValue: { ...theme.type.body, color: theme.colors.text },
  rowDivider: { height: 1, backgroundColor: theme.colors.divider },
  datePickerWrap: {
    paddingBottom: theme.spacing.sm,
    alignItems: 'center',
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  datePickerDoneText: {
    ...theme.type.bodyStrong,
    color: theme.colors.accent,
  },
  amountSection: { paddingVertical: 14 },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  amountInput: {
    ...theme.type.numeralMd,
    color: theme.colors.text,
    flex: 1,
    paddingVertical: 0,
  },
  currencyInput: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    width: 56,
    textAlign: 'right',
    paddingVertical: 0,
  },
  categorySection: {
    marginTop: theme.spacing.lg,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xxs,
    marginBottom: theme.spacing.sm,
  },
  sectionLabel: {
    ...theme.type.eyebrow,
    color: theme.colors.textSubtle,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  catChipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  catChipText: { ...theme.type.label, color: theme.colors.text },
  catChipTextActive: { color: theme.colors.bg },
  sparkleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    backgroundColor: theme.colors.bg,
  },
  cta: {
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.card,
  },
  ctaSuccess: { backgroundColor: theme.colors.success },
  ctaText: { color: theme.colors.bg, ...theme.type.bodyStrong },
  // Extracting view
  extractWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  extractImageWrap: {
    width: 260,
    height: 340,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: 'hidden',
    position: 'relative',
    ...theme.shadow.floating,
  },
  extractImage: {
    width: '100%',
    height: '100%',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: theme.colors.accent,
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  scanCornerTL: cornerStyle('tl'),
  scanCornerTR: cornerStyle('tr'),
  scanCornerBL: cornerStyle('bl'),
  scanCornerBR: cornerStyle('br'),
  extractStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xl,
  },
  extractStatusText: {
    ...theme.type.body,
    color: theme.colors.textMuted,
  },
});

function cornerStyle(pos: 'tl' | 'tr' | 'bl' | 'br') {
  const base = {
    position: 'absolute' as const,
    width: 22,
    height: 22,
    borderColor: theme.colors.accent,
  };
  if (pos === 'tl')
    return { ...base, top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2 };
  if (pos === 'tr')
    return { ...base, top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2 };
  if (pos === 'bl')
    return {
      ...base,
      bottom: 8,
      left: 8,
      borderBottomWidth: 2,
      borderLeftWidth: 2,
    };
  return {
    ...base,
    bottom: 8,
    right: 8,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  };
}
