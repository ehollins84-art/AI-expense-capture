import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../components/Screen';
import { KeyboardAwareFooter } from '../../components/KeyboardAwareFooter';
import { Pressable } from '../../components/Pressable';
import { useStore } from '../../lib/store';
import { theme } from '../../lib/theme';
import { haptic } from '../../lib/haptics';
import {
  SCHEDULE_C_CATEGORIES,
  SCHEDULE_E_CATEGORIES,
} from '../../lib/categories';
import type { CategoryScheme } from '../../lib/types';

export default function NewProject() {
  const router = useRouter();
  const { addProject } = useStore();
  const [name, setName] = useState('');
  const [scheme, setScheme] = useState<CategoryScheme>('schedule_e');
  const [customText, setCustomText] = useState('');

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Give this project a short name.');
      return;
    }
    let custom: string[] | undefined;
    if (scheme === 'custom') {
      custom = customText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (custom.length === 0) {
        Alert.alert(
          'Categories required',
          'Add at least one category — one per line.',
        );
        return;
      }
    }
    try {
      await addProject(name, scheme, custom);
      haptic.success();
      router.back();
    } catch (e) {
      haptic.error();
      Alert.alert('Couldn\'t create project', e instanceof Error ? e.message : String(e));
    }
  }

  const preview =
    scheme === 'schedule_e'
      ? SCHEDULE_E_CATEGORIES
      : scheme === 'schedule_c'
        ? SCHEDULE_C_CATEGORIES
        : customText
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean);

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
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
          </View>

          <Text style={styles.title}>New project</Text>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="123 Main St"
            placeholderTextColor={theme.colors.textSubtle}
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Category set</Text>
          <SchemeOption
            label="Schedule E (Rental real estate)"
            selected={scheme === 'schedule_e'}
            onPress={() => setScheme('schedule_e')}
          />
          <SchemeOption
            label="Schedule C (Self-employed business)"
            selected={scheme === 'schedule_c'}
            onPress={() => setScheme('schedule_c')}
          />
          <SchemeOption
            label="Custom"
            selected={scheme === 'custom'}
            onPress={() => setScheme('custom')}
          />

          {scheme === 'custom' && (
            <>
              <Text style={styles.fieldLabel}>
                Categories — one per line
              </Text>
              <TextInput
                value={customText}
                onChangeText={setCustomText}
                multiline
                placeholder={'Supplies\nUtilities\nRepairs'}
                placeholderTextColor={theme.colors.textSubtle}
                style={[styles.input, { minHeight: 140, textAlignVertical: 'top' }]}
              />
            </>
          )}

          {scheme !== 'custom' && (
            <>
              <Text style={styles.fieldLabel}>Preview</Text>
              <View style={styles.preview}>
                {preview.slice(0, 12).map((c) => (
                  <View key={c} style={styles.previewChip}>
                    <Text style={styles.previewChipText}>{c}</Text>
                  </View>
                ))}
                {preview.length > 12 && (
                  <View style={styles.previewChip}>
                    <Text style={styles.previewChipText}>
                      +{preview.length - 12} more
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}

          <View style={{ height: theme.spacing.xl }} />
      </ScrollView>

      <KeyboardAwareFooter>
        <Pressable
          style={styles.cta}
          hapticOnPress="light"
          onPress={handleCreate}
        >
          <Text style={styles.ctaText}>Create project</Text>
        </Pressable>
      </KeyboardAwareFooter>
    </Screen>
  );
}

function SchemeOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hapticOnPress="select"
      style={[styles.schemeRow, selected && styles.schemeRowActive]}
    >
      <View
        style={[styles.radio, selected && styles.radioActive]}
      />
      <Text
        style={[
          styles.schemeText,
          selected && { color: theme.colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: theme.spacing.lg },
  topBar: { marginBottom: theme.spacing.lg },
  cancelText: { ...theme.type.body, color: theme.colors.textMuted },
  title: {
    ...theme.type.display,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  fieldLabel: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginTop: theme.spacing.md,
    marginBottom: 6,
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
  schemeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
  },
  schemeRowActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: theme.colors.textMuted,
    marginRight: 12,
  },
  radioActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  schemeText: { ...theme.type.body, color: theme.colors.textMuted, flex: 1 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  previewChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.pill,
  },
  previewChipText: { ...theme.type.label, color: theme.colors.textMuted },
  cta: {
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { color: theme.colors.bg, ...theme.type.bodyStrong },
});
