import React from 'react';
import { Pressable as RNPressable, StyleSheet } from 'react-native';
import { theme } from '../lib/theme';
import { haptic } from '../lib/haptics';
import { CameraIcon } from './CameraIcon';

const SIZE = 64;

/**
 * The floating capture button on the home screen. A single tap opens the
 * import sheet (camera + recent photos + library + manual).
 */
export function CaptureFab({
  onPress,
  bottomInset,
}: {
  onPress: () => void;
  bottomInset: number;
}) {
  const bottom = Math.max(bottomInset + 16, 28);
  return (
    <RNPressable
      style={({ pressed }) => [
        styles.fab,
        { bottom },
        pressed && { opacity: 0.92, transform: [{ scale: 0.94 }] },
      ]}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      hitSlop={8}
    >
      <CameraIcon size={28} color="#fff" />
    </RNPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 22,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
});
