import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
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
import { Screen } from '../../components/Screen';
import { Pressable } from '../../components/Pressable';
import { useStore, useActiveProject } from '../../lib/store';
import { theme } from '../../lib/theme';
import { formatDate, formatMoney, moneyTextStyle } from '../../lib/format';
import { imagePathForExpense } from '../../lib/storage';
import { categoriesForProject } from '../../lib/categories';
import { haptic } from '../../lib/haptics';
import { DatePickerModal } from '../../components/DatePickerModal';
import { ReceiptLightbox } from '../../components/ReceiptLightbox';
import { queuePendingDelete } from '../../lib/pendingDelete';
import { signalExpenseDeleted } from '../../lib/uiSignals';
import type { Expense } from '../../lib/types';

type EditField = 'amount' | 'title' | 'category' | null;

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { expenses, iteration, removeExpense, updateExpense, attachImage, projects } =
    useStore();
  const expense = expenses.find((e) => e.id === id);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditField>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    date: '',
    category: '',
    amount: '',
    currency: 'USD',
  });
  const flashAnims = useRef({
    amount: new Animated.Value(0),
    title: new Animated.Value(0),
    date: new Animated.Value(0),
    category: new Animated.Value(0),
  }).current;

  function flash(field: 'amount' | 'title' | 'date' | 'category') {
    const v = flashAnims[field];
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 160, useNativeDriver: false }),
      Animated.timing(v, { toValue: 0, duration: 520, useNativeDriver: false }),
    ]).start();
  }

  useEffect(() => {
    if (!expense) return;
    if (expense.imageFilename) {
      imagePathForExpense(iteration, expense).then((p) =>
        setImageUri(p ? `${p}?t=${Date.now()}` : null),
      );
    } else {
      setImageUri(null);
    }
    setDraft({
      title: expense.title,
      date: expense.date,
      category: expense.category,
      amount: expense.amount.toString(),
      currency: expense.currency,
    });
  }, [expense]);

  const project = useMemo(
    () => projects.find((p) => p.id === expense?.projectId),
    [projects, expense],
  );

  const cats = useMemo(
    () => (project ? categoriesForProject(project) : []),
    [project],
  );

  if (!expense) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={{ color: theme.colors.textMuted }}>
            Expense not found.
          </Text>
        </View>
      </Screen>
    );
  }

  async function commit(field: Exclude<EditField, null>) {
    if (!expense) return;
    let next: Expense = { ...expense };

    if (field === 'amount') {
      const parsed = parseFloat(draft.amount);
      if (isNaN(parsed) || parsed < 0) {
        setDraft((d) => ({ ...d, amount: expense.amount.toString() }));
        setEditing(null);
        return;
      }
      next = {
        ...next,
        amount: parsed,
        currency: draft.currency.trim().toUpperCase() || 'USD',
      };
    } else if (field === 'title') {
      const t = draft.title.trim();
      if (!t) {
        setDraft((d) => ({ ...d, title: expense.title }));
        setEditing(null);
        return;
      }
      next = { ...next, title: t };
    } else if (field === 'category') {
      if (!draft.category) {
        setEditing(null);
        return;
      }
      next = { ...next, category: draft.category };
    }

    setEditing(null);
    Keyboard.dismiss();
    if (JSON.stringify(next) === JSON.stringify(expense)) return;

    try {
      const stored = await updateExpense(next);
      const p = await imagePathForExpense(iteration, stored);
      setImageUri(`${p}?t=${Date.now()}`);
      haptic.light();
      flash(field);
    } catch (e) {
      haptic.error();
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', msg);
      setDraft({
        title: expense.title,
        date: expense.date,
        category: expense.category,
        amount: expense.amount.toString(),
        currency: expense.currency,
      });
    }
  }

  async function pickAndAttach(fromLibrary: boolean) {
    if (!expense) return;
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
      const stored = await attachImage(expense, result.assets[0].uri);
      const p = await imagePathForExpense(iteration, stored);
      setImageUri(p ? `${p}?t=${Date.now()}` : null);
      haptic.success();
    } catch (e) {
      haptic.error();
      Alert.alert(
        'Couldn\'t attach photo',
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  function offerAttach() {
    Alert.alert('Attach a photo', undefined, [
      { text: 'Take photo', onPress: () => pickAndAttach(false) },
      { text: 'Pick from library', onPress: () => pickAndAttach(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function confirmDelete() {
    Alert.alert('Delete this receipt?', 'You\'ll have a few seconds to undo.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!expense) return;
          const snapshot = expense;
          queuePendingDelete(snapshot, () => removeExpense(snapshot));
          signalExpenseDeleted(snapshot);
          haptic.warning();
          router.back();
        },
      },
    ]);
  }

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
            <Pressable
              onPress={() => router.back()}
              style={styles.backBtn}
              hapticOnPress="select"
              hitSlop={8}
            >
              <Text style={styles.backText}>←</Text>
            </Pressable>
            <Pressable
              onPress={confirmDelete}
              hapticOnPress="warning"
              hitSlop={8}
              scaleTo={1}
            >
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>

          {editing === 'amount' ? (
            <View style={styles.amountEditRow}>
              <TextInput
                value={draft.amount}
                onChangeText={(v) => setDraft((d) => ({ ...d, amount: v }))}
                onBlur={() => commit('amount')}
                onSubmitEditing={() => commit('amount')}
                keyboardType="decimal-pad"
                autoFocus
                style={[styles.amountInput, moneyTextStyle]}
                placeholderTextColor={theme.colors.textSubtle}
                placeholder="0.00"
              />
              <TextInput
                value={draft.currency}
                onChangeText={(v) => setDraft((d) => ({ ...d, currency: v }))}
                onBlur={() => commit('amount')}
                onSubmitEditing={() => commit('amount')}
                autoCapitalize="characters"
                maxLength={3}
                style={styles.currencyInput}
                placeholderTextColor={theme.colors.textSubtle}
                placeholder="USD"
              />
            </View>
          ) : (
            <Pressable
              onPress={() => {
                haptic.select();
                setEditing('amount');
              }}
              scaleTo={1}
            >
              <Animated.View
                style={[
                  styles.editableWrap,
                  {
                    backgroundColor: flashAnims.amount.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['transparent', theme.colors.accentSoft],
                    }),
                  },
                ]}
              >
                <Text style={[styles.amount, moneyTextStyle]}>
                  {formatMoney(expense.amount, expense.currency)}
                </Text>
              </Animated.View>
            </Pressable>
          )}

          {editing === 'title' ? (
            <TextInput
              value={draft.title}
              onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))}
              onBlur={() => commit('title')}
              onSubmitEditing={() => commit('title')}
              autoFocus
              style={styles.titleInput}
              placeholderTextColor={theme.colors.textSubtle}
              placeholder="Title"
              returnKeyType="done"
            />
          ) : (
            <Pressable
              onPress={() => {
                haptic.select();
                setEditing('title');
              }}
              scaleTo={1}
            >
              <Animated.View
                style={[
                  styles.editableWrap,
                  {
                    backgroundColor: flashAnims.title.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['transparent', theme.colors.accentSoft],
                    }),
                  },
                ]}
              >
                <Text style={styles.title} numberOfLines={2}>
                  {expense.title}
                </Text>
              </Animated.View>
            </Pressable>
          )}

          <View style={styles.metaCard}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Date</Text>
              <Pressable
                onPress={() => {
                  haptic.select();
                  setDatePickerOpen(true);
                }}
                scaleTo={1}
              >
                <Animated.View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 6,
                    backgroundColor: flashAnims.date.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['transparent', theme.colors.accentSoft],
                    }),
                  }}
                >
                  <Text style={styles.rowValue}>
                    {formatDate(expense.date)}
                  </Text>
                  <Text style={styles.editGlyphInline}>  ›</Text>
                </Animated.View>
              </Pressable>
            </View>

            <View style={styles.rowDivider} />

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Category</Text>
              {editing === 'category' ? (
                <Pressable
                  onPress={() => setEditing(null)}
                  hapticOnPress="select"
                  scaleTo={1}
                >
                  <Text style={[styles.rowValue, { color: theme.colors.accent }]}>
                    Done
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    haptic.select();
                    setEditing('category');
                  }}
                  scaleTo={1}
                >
                  <Animated.View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: flashAnims.category.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['transparent', theme.colors.accentSoft],
                      }),
                    }}
                  >
                    <Text style={styles.rowValue}>{expense.category}</Text>
                  </Animated.View>
                </Pressable>
              )}
            </View>

            {editing === 'category' && (
              <View style={styles.categoryGrid}>
                {cats.map((c) => (
                  <Pressable
                    key={c}
                    hapticOnPress="select"
                    onPress={() => {
                      setDraft((d) => ({ ...d, category: c }));
                      const next: Expense = { ...expense, category: c };
                      if (next.category !== expense.category) {
                        updateExpense(next)
                          .then(() => {
                            haptic.light();
                            flash('category');
                          })
                          .catch((err) => {
                            haptic.error();
                            Alert.alert(
                              'Save failed',
                              err instanceof Error ? err.message : String(err),
                            );
                          });
                      }
                      setEditing(null);
                    }}
                    style={[
                      styles.catChip,
                      c === draft.category && styles.catChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        c === draft.category && styles.catChipTextActive,
                      ]}
                    >
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {project && (
              <>
                <View style={styles.rowDivider} />
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Project</Text>
                  <Text style={styles.rowValue}>{project.name}</Text>
                </View>
              </>
            )}
          </View>

          <View style={styles.thumbWrap}>
            <Text style={styles.thumbEyebrow}>RECEIPT</Text>
            {imageUri ? (
              <View style={styles.thumbShadow}>
                <Pressable
                  onPress={() => {
                    haptic.select();
                    setLightboxOpen(true);
                  }}
                  scaleTo={0.96}
                  style={styles.thumbClip}
                >
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.thumbImage}
                    contentFit="cover"
                  />
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={offerAttach}
                  hapticOnPress="select"
                  scaleTo={0.96}
                  style={styles.thumbPlaceholder}
                >
                  <View style={styles.plusGlyph}>
                    <View style={styles.plusH} />
                    <View style={styles.plusV} />
                  </View>
                </Pressable>
                <Text style={styles.thumbCaption}>Add photo</Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={datePickerOpen}
        initialDate={expense.date}
        onSubmit={(iso) => {
          setDatePickerOpen(false);
          if (iso === expense.date) return;
          const next: Expense = { ...expense, date: iso };
          updateExpense(next)
            .then(async (stored) => {
              const p = await imagePathForExpense(iteration, stored);
              setImageUri(`${p}?t=${Date.now()}`);
              haptic.light();
              flash('date');
            })
            .catch((err) => {
              haptic.error();
              Alert.alert(
                'Save failed',
                err instanceof Error ? err.message : String(err),
              );
            });
        }}
        onDismiss={() => setDatePickerOpen(false)}
      />

      <ReceiptLightbox
        visible={lightboxOpen}
        uri={imageUri}
        onClose={() => setLightboxOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 22, color: theme.colors.text },
  deleteText: { ...theme.type.body, color: theme.colors.danger },
  editableWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  editGlyphInline: {
    fontSize: 13,
    color: theme.colors.textSubtle,
  },
  amount: { ...theme.type.display, color: theme.colors.text },
  amountEditRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  amountInput: {
    ...theme.type.display,
    color: theme.colors.text,
    flex: 1,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
    paddingVertical: 4,
  },
  currencyInput: {
    ...theme.type.title,
    color: theme.colors.textMuted,
    width: 70,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
    paddingVertical: 4,
    textAlign: 'right',
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
    marginTop: 6,
    marginBottom: theme.spacing.lg,
  },
  titleInput: {
    ...theme.type.title,
    color: theme.colors.text,
    marginTop: 6,
    marginBottom: theme.spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
    paddingVertical: 4,
  },
  metaCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowDivider: { height: 1, backgroundColor: theme.colors.border },
  rowLabel: { ...theme.type.label, color: theme.colors.textMuted },
  rowValue: { ...theme.type.body, color: theme.colors.text },
  rowInput: {
    ...theme.type.body,
    color: theme.colors.text,
    textAlign: 'right',
    padding: 0,
    minWidth: 160,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  catChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  catChipText: { ...theme.type.label, color: theme.colors.text },
  catChipTextActive: { color: '#fff' },
  thumbWrap: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
  },
  thumbEyebrow: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    letterSpacing: 1.2,
    fontWeight: '600',
    marginBottom: theme.spacing.md,
  },
  thumbShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  thumbClip: {
    width: 112,
    height: 148,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceAlt,
  },
  thumbImage: {
    width: 112,
    height: 148,
  },
  thumbPlaceholder: {
    width: 112,
    height: 148,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  plusGlyph: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusH: {
    position: 'absolute',
    width: 22,
    height: 2,
    backgroundColor: theme.colors.textSubtle,
    borderRadius: 1,
  },
  plusV: {
    position: 'absolute',
    width: 2,
    height: 22,
    backgroundColor: theme.colors.textSubtle,
    borderRadius: 1,
  },
  thumbCaption: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: 10,
    letterSpacing: 0.2,
  },
});
