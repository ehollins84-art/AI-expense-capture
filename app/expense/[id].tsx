import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
import { CategoryPromptModal } from '../../components/CategoryPromptModal';
import { ReceiptLightbox } from '../../components/ReceiptLightbox';
import { queuePendingDelete } from '../../lib/pendingDelete';
import { signalExpenseDeleted } from '../../lib/uiSignals';
import { ensureCameraPermission, ensureLibraryPermission } from '../../lib/permissions';
import type { Expense } from '../../lib/types';

type EditField = 'amount' | 'title' | 'category' | 'project' | null;

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    expenses,
    iteration,
    removeExpense,
    updateExpense,
    moveExpense,
    attachImage,
    addProjectCategory,
    projects,
  } = useStore();
  const expense = expenses.find((e) => e.id === id);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditField>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [newCatOpen, setNewCatOpen] = useState(false);
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
    project: new Animated.Value(0),
  }).current;

  function flash(field: 'amount' | 'title' | 'date' | 'category' | 'project') {
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
      setImageUri(p ? `${p}?t=${Date.now()}` : null);
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

  // Add a category on the fly from the edit screen, then apply it to this
  // receipt.
  async function handleAddCategory(name: string) {
    setNewCatOpen(false);
    if (!expense || !project) return;
    try {
      const updated = await addProjectCategory(project, name);
      const stored =
        categoriesForProject(updated).find(
          (c) => c.toLowerCase() === name.trim().toLowerCase(),
        ) ?? name.trim();
      setDraft((d) => ({ ...d, category: stored }));
      const next: Expense = { ...expense, category: stored };
      const result = await updateExpense(next);
      const p = await imagePathForExpense(iteration, result);
      setImageUri(`${p}?t=${Date.now()}`);
      haptic.light();
      flash('category');
      setEditing(null);
    } catch (e) {
      haptic.error();
      Alert.alert('Couldn\'t add', e instanceof Error ? e.message : String(e));
    }
  }

  // Move this receipt to a different project. Its folder moves on disk and in
  // Drive; if the new project doesn't have the receipt's category, it becomes
  // Uncategorized there.
  async function handleMove(toProjectId: string) {
    if (!expense) return;
    if (toProjectId === expense.projectId) {
      setEditing(null);
      return;
    }
    const prevCategory = expense.category;
    try {
      const stored = await moveExpense(expense, toProjectId);
      const p = await imagePathForExpense(iteration, stored);
      setImageUri(p ? `${p}?t=${Date.now()}` : null);
      haptic.light();
      flash('project');
      if (stored.category !== prevCategory) flash('category');
      setEditing(null);
    } catch (e) {
      haptic.error();
      Alert.alert('Couldn\'t move', e instanceof Error ? e.message : String(e));
    }
  }

  async function pickAndAttach(fromLibrary: boolean) {
    if (!expense) return;
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
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={theme.spacing.lg}
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

          <Pressable
            onPress={() => {
              if (editing !== 'amount') {
                haptic.select();
                setEditing('amount');
              }
            }}
            scaleTo={1}
          >
            <Animated.View
              style={[
                styles.editableWrap,
                styles.amountRow,
                {
                  backgroundColor: flashAnims.amount.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['transparent', theme.colors.accentSoft],
                  }),
                },
              ]}
            >
              <Text style={[styles.amount, moneyTextStyle]}>$</Text>
              {editing === 'amount' ? (
                <TextInput
                  value={draft.amount}
                  onChangeText={(v) => setDraft((d) => ({ ...d, amount: v }))}
                  onBlur={() => commit('amount')}
                  onSubmitEditing={() => commit('amount')}
                  keyboardType="decimal-pad"
                  autoFocus
                  style={[styles.amount, styles.amountField, moneyTextStyle]}
                  placeholderTextColor={theme.colors.textSubtle}
                  placeholder="0.00"
                />
              ) : (
                <Text
                  style={[styles.amount, styles.amountField, moneyTextStyle]}
                  numberOfLines={1}
                >
                  {expense.amount.toFixed(2)}
                </Text>
              )}
              {editing === 'amount' ? (
                <TextInput
                  value={draft.currency}
                  onChangeText={(v) => setDraft((d) => ({ ...d, currency: v }))}
                  onBlur={() => commit('amount')}
                  onSubmitEditing={() => commit('amount')}
                  autoCapitalize="characters"
                  maxLength={3}
                  style={styles.currencyField}
                  placeholderTextColor={theme.colors.textSubtle}
                  placeholder="USD"
                />
              ) : (
                <Text style={styles.currencyField} numberOfLines={1}>
                  {expense.currency}
                </Text>
              )}
            </Animated.View>
          </Pressable>

          <Pressable
            onPress={() => {
              if (editing !== 'title') {
                haptic.select();
                setEditing('title');
              }
            }}
            scaleTo={1}
          >
            <Animated.View
              style={[
                styles.editableWrap,
                styles.titleWrap,
                {
                  backgroundColor: flashAnims.title.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['transparent', theme.colors.accentSoft],
                  }),
                },
              ]}
            >
              {editing === 'title' ? (
                <TextInput
                  value={draft.title}
                  onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))}
                  onBlur={() => commit('title')}
                  onSubmitEditing={() => commit('title')}
                  autoFocus
                  style={styles.title}
                  placeholderTextColor={theme.colors.textSubtle}
                  placeholder="Title"
                  returnKeyType="done"
                />
              ) : (
                <Text style={styles.title} numberOfLines={2}>
                  {expense.title}
                </Text>
              )}
            </Animated.View>
          </Pressable>

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
                {/* Add a category on the fly if it isn't listed. */}
                <Pressable
                  hapticOnPress="select"
                  onPress={() => setNewCatOpen(true)}
                  style={[styles.catChip, styles.catChipNew]}
                >
                  <Text style={styles.catChipNewText}>+ New</Text>
                </Pressable>
              </View>
            )}

            {project && (
              <>
                <View style={styles.rowDivider} />
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Project</Text>
                  {projects.length > 1 ? (
                    editing === 'project' ? (
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
                          setEditing('project');
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
                            backgroundColor: flashAnims.project.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['transparent', theme.colors.accentSoft],
                            }),
                          }}
                        >
                          <Text style={styles.rowValue}>{project.name}</Text>
                          <Text style={styles.editGlyphInline}>  ›</Text>
                        </Animated.View>
                      </Pressable>
                    )
                  ) : (
                    <Text style={styles.rowValue}>{project.name}</Text>
                  )}
                </View>

                {editing === 'project' && (
                  <View style={styles.categoryGrid}>
                    {projects.map((p) => (
                      <Pressable
                        key={p.id}
                        hapticOnPress="select"
                        onPress={() => handleMove(p.id)}
                        style={[
                          styles.catChip,
                          p.id === expense.projectId && styles.catChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.catChipText,
                            p.id === expense.projectId && styles.catChipTextActive,
                          ]}
                        >
                          {p.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
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
      </KeyboardAwareScrollView>

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
              setImageUri(p ? `${p}?t=${Date.now()}` : null);
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

      <CategoryPromptModal
        visible={newCatOpen}
        title="New category"
        confirmLabel="Add"
        onSubmit={handleAddCategory}
        onDismiss={() => setNewCatOpen(false)}
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
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    alignSelf: 'flex-start',
  },
  amountField: {
    minWidth: 90,
    padding: 0,
  },
  currencyField: {
    ...theme.type.title,
    color: theme.colors.textMuted,
    marginLeft: 10,
    padding: 0,
  },
  titleWrap: {
    marginTop: 6,
    marginBottom: theme.spacing.lg,
    alignSelf: 'flex-start',
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
    padding: 0,
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
  catChipNew: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: theme.colors.accent,
  },
  catChipNewText: { ...theme.type.label, color: theme.colors.accent, fontWeight: '600' },
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
