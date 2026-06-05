import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from './Pressable';
import { theme } from '../lib/theme';

/**
 * A small, cross-platform text prompt for naming or renaming a category.
 * Used identically on Android and iOS (we deliberately avoid the iOS-only
 * Alert.prompt). Renders a centered card with a single text field and
 * Cancel / Confirm actions.
 */
export function CategoryPromptModal({
  visible,
  title,
  confirmLabel,
  initialValue = '',
  placeholder = 'e.g. Software',
  onSubmit,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  confirmLabel: string;
  initialValue?: string;
  placeholder?: string;
  onSubmit: (name: string) => void;
  onDismiss: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);

  // Reset the field each time the modal opens and focus it.
  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      // Slight delay lets the modal finish presenting before we focus, so the
      // keyboard reliably appears on both platforms.
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [visible, initialValue]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.scrim} onPress={onDismiss} scaleTo={1}>
        <Pressable style={styles.card} onPress={() => {}} scaleTo={1}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textSubtle}
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              hapticOnPress="select"
              onPress={onDismiss}
              scaleTo={1}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              hapticOnPress="light"
              onPress={submit}
              scaleTo={1}
            >
              <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  input: {
    ...theme.type.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: theme.spacing.lg,
  },
  btn: {
    flex: 1,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: theme.colors.text },
  btnPrimaryText: { color: theme.colors.bg, fontSize: 16, fontWeight: '600' },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btnGhostText: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
});
