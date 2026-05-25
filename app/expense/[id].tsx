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
import { Screen } from '../../components/Screen';
import { Pressable } from '../../components/Pressable';
import { useStore, useActiveProject } from '../../lib/store';
import { theme } from '../../lib/theme';
import { formatDate, formatMoney } from '../../lib/format';
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
        Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
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
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>←</Text>
            </Pressable>
            <Pressable onPress={confirmDelete}>
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
                style={styles.amountInput}
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
            <Pressable onPress={() => setEditing('amount')}>
              <Text style={styles.amount}>
                {formatMoney(expense.amount, expense.currency)}
              </Text>
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
            <Pressable onPress={() => setEditing('title')}>
              <Text style={styles.title}>{expense.title}</Text>
            </Pressable>
          )}

          <View style={styles.metaCard}>
            <EditableRow
              label="Date"
              isEditing={editing === 'date'}
              onPressLabel={() => setEditing('date')}
              displayValue={formatDate(expense.date)}
              editor={
                <TextInput
                  value={draft.date}
                  onChangeText={(v) => setDraft((d) => ({ ...d, date: v }))}
                  onBlur={() => commit('date')}
                  onSubmitEditing={() => commit('date')}
                  autoFocus
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.textSubtle}
                  style={styles.rowInput}
                  returnKeyType="done"
                />
              }
            />

            <View style={styles.rowDivider} />

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Category</Text>
              {editing === 'category' ? (
                <Pressable onPress={() => setEditing(null)}>
                  <Text style={[styles.rowValue, { color: theme.colors.accent }]}>
                    Done
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => setEditing('category')}>
                  <Text style={styles.rowValue}>{expense.category}</Text>
                </Pressable>
              )}
            </View>

            {editing === 'category' && (
              <View style={styles.categoryGrid}>
                {cats.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setDraft((d) => ({ ...d, category: c }));
                      // Commit immediately on selection.
                      const next: Expense = { ...expense, category: c };
                      if (next.category !== expense.category) {
                        updateExpense(next).catch((err) => {
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

          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={styles.receiptImage}
              contentFit="cover"
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function EditableRow({
  label,
  isEditing,
  onPressLabel,
  displayValue,
  editor,
}: {
  label: string;
  isEditing: boolean;
  onPressLabel: () => void;
  displayValue: string;
  editor: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {isEditing ? (
        <View style={{ flex: 1, alignItems: 'flex-end' }}>{editor}</View>
      ) : (
        <Pressable onPress={onPressLabel}>
          <Text style={styles.rowValue}>{displayValue}</Text>
        </Pressable>
      )}
    </View>
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
  receiptImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceAlt,
  },
});
