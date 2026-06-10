import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Pressable } from './Pressable';
import { theme } from '../lib/theme';

function parseISO(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function toISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function DatePickerModal({
  visible,
  initialDate,
  onSubmit,
  onDismiss,
}: {
  visible: boolean;
  initialDate: string;
  onSubmit: (iso: string) => void;
  onDismiss: () => void;
}) {
  const [value, setValue] = useState<Date>(() => parseISO(initialDate));

  React.useEffect(() => {
    if (visible) setValue(parseISO(initialDate));
  }, [visible, initialDate]);

  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        onChange={(event, selected) => {
          if (event.type === 'set' && selected) {
            onSubmit(toISO(selected));
          } else {
            onDismiss();
          }
        }}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      {/* Plain RN Pressables so the backdrop fills the screen and the card
          anchors to the bottom; the custom Pressable's animation wrapper has no
          flex and collapses the modal. */}
      <RNPressable style={styles.scrim} onPress={onDismiss}>
        <RNPressable style={styles.card} onPress={() => {}}>
          <View style={styles.handle} />
          <DateTimePicker
            value={value}
            mode="date"
            display="inline"
            onChange={(_, selected) => {
              if (selected) setValue(selected);
            }}
            themeVariant="light"
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
              onPress={() => onSubmit(toISO(value))}
              scaleTo={1}
            >
              <Text style={styles.btnPrimaryText}>Done</Text>
            </Pressable>
          </View>
        </RNPressable>
      </RNPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 8,
    paddingBottom: theme.spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: theme.spacing.sm,
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

export { parseISO, toISO };
