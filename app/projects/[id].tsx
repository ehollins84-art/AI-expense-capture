import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../components/Screen';
import { Pressable } from '../../components/Pressable';
import { CategoryPromptModal } from '../../components/CategoryPromptModal';
import { useStore } from '../../lib/store';
import { theme } from '../../lib/theme';
import {
  baseCategoriesForProject,
  categoriesForProject,
  labelForScheme,
  removableCategories,
  UNCATEGORIZED,
} from '../../lib/categories';
import { haptic } from '../../lib/haptics';
import { myEmail, shareConfigured } from '../../lib/share';
import type { Project } from '../../lib/types';

export default function EditProject() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    projects,
    expenses,
    updateProject,
    removeProject,
    addProjectCategory,
    renameProjectCategory,
    deleteProjectCategory,
    shareProject,
    inviteToProject,
    leaveSharedProject,
  } = useStore();
  const project = projects.find((p) => p.id === id);

  const [name, setName] = useState(project?.name ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  // When set, the rename prompt is open for this existing category name.
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  // Email-entry prompt: 'share' to start sharing a project, 'invite' to add
  // another person to an already-shared project.
  const [emailPrompt, setEmailPrompt] = useState<'share' | 'invite' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    myEmail().then(setMe);
  }, []);

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

  const isShared = !!project.shareId;
  const isOwner = isShared && !!me && me === project.ownerEmail;

  // --- Email-entry prompt (used for both "share" and "invite") ---
  async function handleEmailSubmit(email: string) {
    const mode = emailPrompt;
    setEmailPrompt(null);
    const trimmed = email.trim();
    if (!trimmed || !project) return;
    if (!shareConfigured()) {
      Alert.alert(
        'Sharing isn\'t available',
        'This build isn\'t set up for shared projects yet.',
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === 'share') {
        await shareProject(project, trimmed);
        haptic.success();
        Alert.alert(
          'Project shared',
          `${trimmed} can now add expenses to "${project.name}" and you'll both see the same receipts and combined total. They'll see it once they sign in with this email.`,
        );
      } else if (mode === 'invite') {
        await inviteToProject(project, trimmed);
        haptic.success();
        Alert.alert('Person added', `${trimmed} can now add to this project.`);
      }
    } catch (e) {
      haptic.error();
      Alert.alert(
        'Couldn\'t share',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmLeave() {
    if (!project) return;
    const ownerLeaving = isOwner;
    const title = ownerLeaving ? 'Delete shared project?' : 'Leave shared project?';
    const message = ownerLeaving
      ? `You own "${project.name}". Deleting it removes it for everyone you've shared it with. This can't be undone.`
      : `You'll stop seeing "${project.name}" and its expenses. The owner keeps it.`;
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: ownerLeaving ? 'Delete for everyone' : 'Leave',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await leaveSharedProject(project);
            haptic.warning();
            router.back();
          } catch (e) {
            haptic.error();
            Alert.alert(
              'Couldn\'t leave',
              e instanceof Error ? e.message : String(e),
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  // ===========================================================================
  // Shared project view — name and categories are fixed; the screen is about
  // who it's shared with.
  // ===========================================================================
  if (isShared) {
    const cats = categoriesForProject(project);
    return (
      <Screen>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            hapticOnPress="select"
            hitSlop={12}
            scaleTo={1}
          >
            <Text style={styles.cancelText}>Done</Text>
          </Pressable>
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bottomOffset={theme.spacing.lg}
        >
          <Text style={styles.heading}>{project.name}</Text>
          <View style={styles.sharedBadge}>
            <Text style={styles.sharedBadgeText}>● Shared project</Text>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: theme.spacing.lg }]}>
            People
          </Text>
          <View style={styles.peopleCard}>
            {(project.members ?? []).map((email) => {
              const isYou = !!me && email === me;
              const owner = email === project.ownerEmail;
              return (
                <View key={email} style={styles.personRow}>
                  <Text style={styles.personEmail} numberOfLines={1}>
                    {email}
                    {isYou ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.personRole}>{owner ? 'Owner' : 'Member'}</Text>
                </View>
              );
            })}
          </View>

          {isOwner && (
            <Pressable
              style={[styles.btn, styles.btnGhost, { marginTop: theme.spacing.md }]}
              hapticOnPress="select"
              disabled={busy}
              onPress={() => setEmailPrompt('invite')}
            >
              <Text style={styles.btnGhostText}>+ Add someone by email</Text>
            </Pressable>
          )}

          <Text style={[styles.fieldLabel, { marginTop: theme.spacing.lg }]}>
            Categories
          </Text>
          <View style={styles.chipWrap}>
            {cats.map((c) => (
              <View key={c} style={[styles.chip, styles.chipLocked]}>
                <Text style={styles.chipLockedText}>{c}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.helperText}>
            Everyone in this project sees the same expenses, receipt photos, and
            running total.
          </Text>

          <View style={styles.divider} />

          <Pressable
            style={[styles.btn, styles.btnDanger]}
            hapticOnPress="warning"
            onPress={confirmLeave}
            disabled={busy}
            scaleTo={1}
          >
            <Text style={styles.btnDangerText}>
              {isOwner ? 'Delete shared project' : 'Leave shared project'}
            </Text>
          </Pressable>

          <View style={{ height: theme.spacing.xxl }} />
        </KeyboardAwareScrollView>

        <CategoryPromptModal
          visible={emailPrompt === 'invite'}
          title="Add someone"
          confirmLabel="Add"
          onSubmit={handleEmailSubmit}
          onDismiss={() => setEmailPrompt(null)}
        />
      </Screen>
    );
  }

  // ===========================================================================
  // Personal project view (original editor + a Share entry point).
  // ===========================================================================

  // Built-in tax categories shown (locked) for Schedule E/C projects.
  const base = baseCategoriesForProject(project);
  // The user's own categories — the only ones that can be renamed or removed.
  const removable = removableCategories(project);

  function usageCount(c: string): number {
    return expenses.filter(
      (e) => e.projectId === project!.id && e.category.toLowerCase() === c.toLowerCase(),
    ).length;
  }

  async function handleAddCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    try {
      await addProjectCategory(project!, trimmed);
      setNewCategory('');
      haptic.success();
    } catch (e) {
      haptic.warning();
      Alert.alert('Couldn\'t add', e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRename(from: string, to: string) {
    setRenameTarget(null);
    if (to.trim().toLowerCase() === from.toLowerCase()) return;
    try {
      await renameProjectCategory(project!, from, to);
      haptic.success();
    } catch (e) {
      haptic.error();
      Alert.alert('Couldn\'t rename', e instanceof Error ? e.message : String(e));
    }
  }

  // Tapping one of the user's own categories offers to rename or delete it.
  function openCategoryOptions(c: string) {
    Alert.alert(c, undefined, [
      { text: 'Rename', onPress: () => setRenameTarget(c) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmRemoveCategory(c),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function confirmRemoveCategory(c: string) {
    const used = usageCount(c);
    const message =
      used > 0
        ? `${used} receipt${used === 1 ? '' : 's'} use "${c}". They'll be moved to ${UNCATEGORIZED}.`
        : `Remove "${c}" from this project?`;
    Alert.alert('Remove category?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProjectCategory(project!, c);
            haptic.warning();
          } catch (e) {
            haptic.error();
            Alert.alert(
              'Couldn\'t remove',
              e instanceof Error ? e.message : String(e),
            );
          }
        },
      },
    ]);
  }

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    try {
      // Categories are persisted immediately as they're edited; here we only
      // commit any change to the project name.
      const next: Project = { ...project, name: name.trim() };
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

  function handleShare() {
    if (!shareConfigured()) {
      Alert.alert(
        'Sharing isn\'t available',
        'This build isn\'t set up for shared projects yet.',
      );
      return;
    }
    if (!me) {
      Alert.alert(
        'Connect Google first',
        'Sharing uses your Google account to identify you. Connect Google in Settings, then come back to share.',
      );
      return;
    }
    Alert.alert(
      'Share this project',
      `You'll add someone by email. They'll be able to add expenses and see everything — receipts, photos, and the combined total.${
        expenseCount > 0
          ? `\n\nYour ${expenseCount} existing receipt${expenseCount === 1 ? '' : 's'} (and their photos) will move into the shared project.`
          : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add an email', onPress: () => setEmailPrompt('share') },
      ],
    );
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
      {/* Fixed header stays put; the form below scrolls and keeps the focused
          field above the keyboard via KeyboardAwareScrollView. */}
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

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={theme.spacing.lg}
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
              manage your own categories below.
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

          <Text style={[styles.fieldLabel, { marginTop: theme.spacing.lg }]}>
            Your categories
          </Text>
          <View style={styles.chipWrap}>
            {removable.map((c) => (
              // Tap a category to open Rename / Delete options.
              <Pressable
                key={c}
                onPress={() => openCategoryOptions(c)}
                hapticOnPress="select"
                scaleTo={1}
                style={[styles.chip, styles.chipRemovable]}
              >
                <Text style={styles.chipRemovableText}>{c}</Text>
                <Text style={styles.chipRemoveGlyph}>  ⋯</Text>
              </Pressable>
            ))}
            {/* Uncategorized is always present and can't be removed. */}
            <View style={[styles.chip, styles.chipLocked]}>
              <Text style={styles.chipLockedText}>{UNCATEGORIZED}</Text>
            </View>
          </View>
          <Text style={styles.helperText}>
            Tap a category to rename or remove it. Removing a category moves its
            receipts to {UNCATEGORIZED}.
          </Text>

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
              onSubmitEditing={handleAddCategory}
              returnKeyType="done"
            />
            <Pressable
              style={styles.addBtn}
              hapticOnPress="light"
              onPress={handleAddCategory}
            >
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>

          {/* --- Share entry point --- */}
          <Text style={[styles.fieldLabel, { marginTop: theme.spacing.lg }]}>
            Share
          </Text>
          <View style={styles.schemeCard}>
            <Text style={styles.schemeHint}>
              Share this project with someone by email. You'll both be able to
              add expenses and see the same receipts, photos, and combined
              total.
            </Text>
            <Pressable
              style={[styles.btn, styles.btnGhost, { marginTop: theme.spacing.md }]}
              hapticOnPress="select"
              disabled={busy}
              onPress={handleShare}
            >
              <Text style={styles.btnGhostText}>
                {busy ? 'Sharing…' : 'Share this project'}
              </Text>
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
      </KeyboardAwareScrollView>

      <CategoryPromptModal
        visible={renameTarget !== null}
        title="Rename category"
        confirmLabel="Rename"
        initialValue={renameTarget ?? ''}
        onSubmit={(to) => renameTarget && handleRename(renameTarget, to)}
        onDismiss={() => setRenameTarget(null)}
      />

      <CategoryPromptModal
        visible={emailPrompt === 'share'}
        title="Share with"
        confirmLabel="Share"
        onSubmit={handleEmailSubmit}
        onDismiss={() => setEmailPrompt(null)}
      />
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
  sharedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sharedBadgeText: {
    ...theme.type.label,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  peopleCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  personRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  personEmail: { ...theme.type.body, color: theme.colors.text, flex: 1, marginRight: 8 },
  personRole: { ...theme.type.label, color: theme.colors.textMuted },
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
