import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen } from '../../components/Screen';
import { Pressable } from '../../components/Pressable';
import { Icon } from '../../components/Icon';
import { Money } from '../../components/Money';
import { useStore } from '../../lib/store';
import { theme, swatchFor } from '../../lib/theme';
import { formatDate } from '../../lib/format';
import { imagePathForExpense } from '../../lib/storage';
import { categoriesForProject } from '../../lib/categories';
import type { Expense } from '../../lib/types';

type EditField = 'amount' | 'title' | 'date' | 'category' | null;

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { expenses, iteration, removeExpense, updateExpense, projects } =
    useStore();
  const expense = expenses.find((e) => e.id === id);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditField>(null);
  const [draft, setDraft] = useState({
    title: '',
    date: '',
    category: '',
    amount: '',
    currency: 'USD',
  });

  useEffect(() => {
    if (!expense) return;
    imagePathForExpense(iteration, expense).then((p) =>
      setImageUri(`${p}?t=${Date.now()}`),
    );
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
    } else if (field === 'date') {
      const d = draft.date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) {
        setDraft((s) => ({ ...s, date: expense.date }));
        setEditing(null);
        return;
      }
      next = { ...next, date: d };
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
    } catch (e) {
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

  function confirmDelete() {
    Alert.alert('Delete expense?', 'This removes the receipt locally.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!expense) return;
          await removeExpense(expense);
          router.back();
        },
      },
    ]);
  }

  function onDateChange(_e: DateTimePickerEvent, picked?: Date) {
    if (!expense) return;
    if (Platform.OS === 'android') setEditing(null);
    if (picked) {
      const iso = picked.toISOString().slice(0, 10);
      setDraft((d) => ({ ...d, date: iso }));
      if (Platform.OS === 'android') {
        // Android picker auto-dismisses; commit immediately.
        const next: Expense = { ...expense, date: iso };
        updateExpense(next).then(async (stored) => {
          const p = await imagePathForExpense(iteration, stored);
          setImageUri(`${p}?t=${Date.now()}`);
        });
      }
    }
  }

  const swatch = swatchFor(expense.category);

  return (
    <Screen edges={[]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(360)}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.heroImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]} />
            )}
            <View style={styles.heroOverlay} />
            <View style={styles.heroTopBar}>
              <Pressable
                haptic="selection"
                onPress={() => router.back()}
                style={styles.heroIconBtn}
              >
                <Icon name="chevron-left" size={22} color="#fff" />
              </Pressable>
              <Pressable
                haptic="selection"
                onPress={confirmDelete}
                style={styles.heroIconBtn}
              >
                <Icon name="more" size={20} color="#fff" />
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.duration(380).springify().damping(20)}
            style={styles.detailCard}
          >
            <View style={styles.categoryBadge}>
              <View style={[styles.categoryDot, { backgroundColor: swatch }]} />
              {editing === 'category' ? (
                <Pressable onPress={() => setEditing(null)}>
                  <Text style={[styles.categoryBadgeText, { color: theme.colors.accent }]}>
                    Done
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => setEditing('category')}>
                  <Text style={styles.categoryBadgeText}>{expense.category}</Text>
                </Pressable>
              )}
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
                  style={styles.amountInput}
                  placeholderTextColor={theme.colors.textSubtle}
                  placeholder="0.00"
                />
                <TextInput
                  value={draft.currency}
                  onChangeText={(v) => setDraft((d) => ({ ...d, currency: v }))}
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
                haptic="selection"
                onPress={() => setEditing('amount')}
                style={styles.editableHero}
              >
                <Money
                  amount={expense.amount}
                  currency={expense.currency}
                  size="hero"
                />
                <Icon name="edit" size={14} color={theme.colors.textSubtle} />
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
                haptic="selection"
                onPress={() => setEditing('title')}
                style={styles.editableRow}
              >
                <Text style={styles.title} numberOfLines={2}>
                  {expense.title}
                </Text>
                <Icon name="edit" size={12} color={theme.colors.textSubtle} />
              </Pressable>
            )}

            <View style={styles.metaCard}>
              <Pressable
                haptic="selection"
                onPress={() => setEditing(editing === 'date' ? null : 'date')}
                style={styles.row}
              >
                <View style={styles.rowLabelGroup}>
                  <Icon
                    name="calendar"
                    size={14}
                    color={theme.colors.textSubtle}
                  />
                  <Text style={styles.rowLabel}>Date</Text>
                </View>
                <View style={styles.rowValueGroup}>
                  <Text style={styles.rowValue}>{formatDate(expense.date)}</Text>
                  <Icon name="edit" size={12} color={theme.colors.textSubtle} />
                </View>
              </Pressable>
              {editing === 'date' && (
                <View style={styles.datePickerWrap}>
                  <DateTimePicker
                    value={draft.date ? new Date(draft.date) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={onDateChange}
                    themeVariant="light"
                  />
                  {Platform.OS === 'ios' && (
                    <Pressable
                      haptic="selection"
                      style={styles.datePickerDone}
                      onPress={() => commit('date')}
                    >
                      <Text style={styles.datePickerDoneText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {editing === 'category' && (
                <>
                  <View style={styles.rowDivider} />
                  <View style={styles.categoryGrid}>
                    {cats.map((c) => (
                      <Pressable
                        key={c}
                        haptic="selection"
                        onPress={() => {
                          setDraft((d) => ({ ...d, category: c }));
                          const next: Expense = { ...expense, category: c };
                          if (next.category !== expense.category) {
                            updateExpense(next).catch((err) => {
                              Alert.alert(
                                'Save failed',
                                err instanceof Error
                                  ? err.message
                                  : String(err),
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
                </>
              )}

              {project && (
                <>
                  <View style={styles.rowDivider} />
                  <View style={styles.row}>
                    <View style={styles.rowLabelGroup}>
                      <Icon
                        name="folder"
                        size={14}
                        color={theme.colors.textSubtle}
                      />
                      <Text style={styles.rowLabel}>Project</Text>
                    </View>
                    <Text style={styles.rowValue}>{project.name}</Text>
                  </View>
                </>
              )}
            </View>

            <Pressable
              haptic="medium"
              onPress={confirmDelete}
              style={styles.deleteBtn}
            >
              <Icon name="trash" size={16} color={theme.colors.danger} />
              <Text style={styles.deleteText}>Delete receipt</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const HERO_HEIGHT = 380;

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: theme.spacing.xl },
  heroImage: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: theme.colors.surfaceSunken,
  },
  heroPlaceholder: { backgroundColor: theme.colors.surfaceAlt },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'transparent',
  },
  heroTopBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 24,
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCard: {
    backgroundColor: theme.colors.bg,
    marginTop: -24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    marginBottom: theme.spacing.md,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  categoryBadgeText: {
    ...theme.type.caption,
    color: theme.colors.text,
    textTransform: 'none',
  },
  editableHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  editableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  amountEditRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  amountInput: {
    ...theme.type.numeral,
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
    flex: 1,
  },
  titleInput: {
    ...theme.type.title,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
    paddingVertical: 4,
  },
  metaCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    paddingHorizontal: theme.spacing.md,
    ...theme.shadow.card,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
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
  rowDivider: { height: 1, backgroundColor: theme.colors.divider },
  rowLabel: { ...theme.type.label, color: theme.colors.textMuted },
  rowValue: { ...theme.type.body, color: theme.colors.text },
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
    borderColor: theme.colors.divider,
  },
  catChipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  catChipText: { ...theme.type.label, color: theme.colors.text },
  catChipTextActive: { color: theme.colors.bg },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xl,
    paddingVertical: 14,
  },
  deleteText: { ...theme.type.body, color: theme.colors.danger },
});
