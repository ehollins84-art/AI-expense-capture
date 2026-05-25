import React, { useMemo, useState } from 'react';
import {
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
import { Screen } from '../../components/Screen';
import { Pressable } from '../../components/Pressable';
import { useStore } from '../../lib/store';
import { theme } from '../../lib/theme';
import { baseCategoriesForProject, labelForScheme } from '../../lib/categories';
import { haptic } from '../../lib/haptics';
import type { Project } from '../../lib/types';

export default function EditProject() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { projects, expenses, updateProject, removeProject } = useStore();
  const project = projects.find((p) => p.id === id);

  const [name, setName] = useState(project?.name ?? '');
  const [additional, setAdditional] = useState<string[]>(
    project?.additionalCategories ?? [],
  );
  const [customBase, setCustomBase] = useState<string[]>(
    project?.scheme === 'custom' ? project.customCategories ?? [] : [],
  );
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const expenseCount = useMemo(
    () => (project ? expenses.filter((e) => e.projectId === project.id).length : 0),
    [expenses, project],
  );

  if (!project) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={{ color: theme.colors.textMuted }}>
            That project no longer exists.
          </Text>
          <Pressable
            style={[styles.btn, styles.btnGhost, { marginTop: theme.spacing.lg }]}
            onPress={() => router.back()}
            hapticOnPress="select"
          >
            <Text style={styles.btnGhostText}>Back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const base = baseCategoriesForProject({ ...project, customCategories: customBase });
  const baseLowered = new Set(base.map((c) => c.toLowerCase()));

  function addCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (baseLowered.has(trimmed.toLowerCase())) {
      haptic.warning();
      Alert.alert('Already there', `"${trimmed}" is already in this project's base categories.`);
      return;
    }
    if (project!.scheme === 'custom') {
      if (customBase.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
        haptic.warning();
        Alert.alert('Already there', `"${trimmed}" is already listed.`);
        return;
      }
      setCustomBase((prev) => [...prev, trimmed]);
    } else {
      if (additional.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
        haptic.warning();
        Alert.alert('Already there', `"${trimmed}" is already listed.`);
        return;
      }
      setAdditional((prev) => [...prev, trimmed]);
    }
    setNewCategory('');
    haptic.success();
  }

  function removeAdditional(c: string) {
    const usedCount = expenses.filter(
      (e) => e.projectId === project!.id && e.category === c,
    ).length;
    if (usedCount > 0) {
      haptic.warning();
      Alert.alert(
        'Category in use',
        `${usedCount} receipt${usedCount === 1 ? '' : 's'} use "${c}". Reassign or delete those first.`,
      );
      return;
    }
    setAdditional((prev) => prev.filter((x) => x !== c));
    haptic.light();
  }

  function removeCustomBase(c: string) {
    const usedCount = expenses.filter(
      (e) => e.projectId === project!.id && e.category === c,
    ).length;
    if (usedCount > 0) {
      Alert.alert(
        'Category in use',
        `${usedCount} receipt${usedCount === 1 ? '' : 's'} use "${c}". Reassign or delete those first, or keep this category.`,
      );
      return;
    }
    if (customBase.length <= 1) {
      Alert.alert('Need at least one', 'A custom project needs at least one category.');
      return;
    }
    setCustomBase((prev) => prev.filter((x) => x !== c));
    haptic.light();
  }

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    try {
      const next: Project = {
        ...project,
        name: name.trim(),
        customCategories: project.scheme === 'custom' ? customBase : project.customCategories,
        additionalCategories: project.scheme === 'custom' ? undefined : additional,
      };
      await updateProject(next);
      haptic.success();
      router.back();
    } catch (e) {
      haptic.error();
      Alert.alert('Couldn\'t save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!project) return;
    const msg =
      expenseCount > 0
        ? `Delete "${project.name}" and all ${expenseCount} receipt${
            expenseCount === 1 ? '' : 's'
          } in it? This can't be undone.`
        : `Delete "${project.name}"? It has no receipts.`;
    Alert.alert('Delete project?', msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (expenseCount > 0) {
            Alert.alert(
              'Really delete?',
              `Deleting "${project.name}" wipes ${expenseCount} receipt${
                expenseCount === 1 ? '' : 's'
              } from this phone permanently.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await removeProject(project);
                      haptic.warning();
                      router.back();
                    } catch (e) {
                      haptic.error();
                      Alert.alert(
                        'Couldn\'t delete',
                        e instanceof Error ? e.message : String(e),
                      );
                    }
                  },
                },
              ],
            );
          } else {
            removeProject(project)
              .then(() => {
                haptic.warning();
                router.back();
              })
              .catch((e) => {
                haptic.error();
                Alert.alert(
                  'Couldn\'t delete',
                  e instanceof Error ? e.message : String(e),
                );
              });
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            hapticOnPress="select"
            hitSlop={12}
            scaleTo={1}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            hapticOnPress="light"
            hitSlop={12}
            scaleTo={1}
          >
            <Text style={[styles.saveText, saving && { opacity: 0.5 }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.heading}>Edit project</Text>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Project name"
            placeholderTextColor={theme.colors.textSubtle}
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Category set</Text>
          <View style={styles.schemeCard}>
            <Text style={styles.schemeLabel}>{labelForScheme(project.scheme)}</Text>
            <Text style={styles.schemeHint}>
              The category set is locked in when a project is created. You can
              add extra categories below.
            </Text>
          </View>

          {project.scheme !== 'custom' && (
            <>
              <Text style={styles.fieldLabel}>Built-in categories</Text>
              <View style={styles.chipWrap}>
                {base.map((c) => (
                  <View key={c} style={[styles.chip, styles.chipLocked]}>
                    <Text style={styles.chipLockedText}>{c}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.helperText}>
                These come from {labelForScheme(project.scheme)} and can't be
                removed — they're standard tax categories.
              </Text>
            </>
          )}

          {project.scheme === 'custom' && (
            <>
              <Text style={styles.fieldLabel}>Categories</Text>
              <View style={styles.chipWrap}>
                {customBase.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => removeCustomBase(c)}
                    hapticOnPress="none"
                    scaleTo={1}
                    style={[styles.chip, styles.chipRemovable]}
                  >
                    <Text style={styles.chipRemovableText}>{c}</Text>
                    <Text style={styles.chipRemoveGlyph}>  ×</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {project.scheme !== 'custom' && additional.length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: theme.spacing.lg }]}>
                Your additions
              </Text>
              <View style={styles.chipWrap}>
                {additional.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => removeAdditional(c)}
                    hapticOnPress="none"
                    scaleTo={1}
                    style={[styles.chip, styles.chipRemovable]}
                  >
                    <Text style={styles.chipRemovableText}>{c}</Text>
                    <Text style={styles.chipRemoveGlyph}>  ×</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={[styles.fieldLabel, { marginTop: theme.spacing.lg }]}>
            Add a category
          </Text>
          <View style={styles.addRow}>
            <TextInput
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder="e.g. Software"
              placeholderTextColor={theme.colors.textSubtle}
              style={[styles.input, { flex: 1 }]}
              onSubmitEditing={addCategory}
              returnKeyType="done"
            />
            <Pressable
              style={styles.addBtn}
              hapticOnPress="light"
              onPress={addCategory}
            >
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>

          <View style={styles.divider} />

          <Pressable
            style={[styles.btn, styles.btnDanger]}
            hapticOnPress="warning"
            onPress={handleDelete}
            scaleTo={1}
          >
            <Text style={styles.btnDangerText}>
              Delete project
              {expenseCount > 0 ? ` (and ${expenseCount} receipt${expenseCount === 1 ? '' : 's'})` : ''}
            </Text>
          </Pressable>

          <View style={{ height: theme.spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  cancelText: { ...theme.type.body, color: theme.colors.textMuted },
  saveText: { ...theme.type.bodyStrong, color: theme.colors.accent },
  scroll: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  heading: {
    ...theme.type.display,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  fieldLabel: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginTop: theme.spacing.md,
    marginBottom: 8,
  },
  helperText: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: 8,
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
  schemeCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  schemeLabel: { ...theme.type.bodyStrong, color: theme.colors.text },
  schemeHint: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipLocked: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  chipLockedText: {
    ...theme.type.label,
    color: theme.colors.textMuted,
  },
  chipRemovable: {
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  chipRemovableText: {
    ...theme.type.label,
    color: theme.colors.accent,
  },
  chipRemoveGlyph: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    backgroundColor: theme.colors.text,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
  },
  addBtnText: {
    color: theme.colors.bg,
    ...theme.type.bodyStrong,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xl,
  },
  btn: {
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btnGhostText: { color: theme.colors.text, ...theme.type.bodyStrong },
  btnDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  btnDangerText: { color: theme.colors.danger, ...theme.type.bodyStrong },
});
