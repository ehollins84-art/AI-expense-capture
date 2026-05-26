import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from './Pressable';
import { MagnifyingGlassIcon } from './MagnifyingGlassIcon';
import { theme } from '../lib/theme';

export function SearchField({
  value,
  onChangeText,
  onCancel,
  onSubmitEditing,
  autoFocus = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onCancel: () => void;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <MagnifyingGlassIcon size={18} color={theme.colors.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          placeholder="Search receipts"
          placeholderTextColor={theme.colors.textSubtle}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
          style={styles.input}
        />
        {Platform.OS === 'android' && value.length > 0 && (
          <Pressable
            onPress={() => onChangeText('')}
            hitSlop={10}
            scaleTo={1}
            hapticOnPress="select"
            style={styles.clear}
          >
            <Text style={styles.clearGlyph}>×</Text>
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={onCancel}
        hitSlop={10}
        scaleTo={1}
        hapticOnPress="select"
        style={styles.cancelBtn}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: 10,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    minHeight: 40,
  },
  input: {
    flex: 1,
    ...theme.type.body,
    color: theme.colors.text,
    padding: 0,
  },
  clear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearGlyph: {
    color: theme.colors.surface,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 4,
  },
  cancelText: {
    ...theme.type.body,
    color: theme.colors.accent,
    fontWeight: '600',
  },
});
