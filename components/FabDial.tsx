import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { theme } from '../lib/theme';
import { haptic } from '../lib/haptics';
import { CameraIcon } from './CameraIcon';

const SPRING = { damping: 18, stiffness: 200, mass: 0.6 };

const MAIN_SIZE = 64;
const MINI_SIZE = 48;
const ROW_GAP = 14;
const FIRST_OFFSET = MAIN_SIZE + ROW_GAP + MINI_SIZE / 2 + 8;
const SECOND_OFFSET = FIRST_OFFSET + MINI_SIZE + ROW_GAP;

export function FabDial({
  onCamera,
  onLibrary,
  onManual,
  bottomInset,
}: {
  onCamera: () => void;
  onLibrary: () => void;
  onManual: () => void;
  bottomInset: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const progress = useSharedValue(0);

  const bottom = Math.max(bottomInset + 16, 28);

  function open() {
    if (expanded) return;
    setExpanded(true);
    haptic.select();
    progress.value = withSpring(1, SPRING);
  }

  function close() {
    if (!expanded) return;
    setExpanded(false);
    progress.value = withSpring(0, SPRING);
  }

  function fireCamera() {
    haptic.medium();
    if (expanded) close();
    onCamera();
  }

  function fireLibrary() {
    haptic.light();
    close();
    onLibrary();
  }

  function fireManual() {
    haptic.light();
    close();
    onManual();
  }

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (expanded) {
        close();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [expanded]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolate.CLAMP),
  }));

  const libraryStyle = useAnimatedStyle(() => {
    const local = interpolate(
      progress.value,
      [0, 0.55],
      [0, 1],
      Extrapolate.CLAMP,
    );
    return {
      transform: [
        { translateY: interpolate(local, [0, 1], [0, -FIRST_OFFSET]) },
        { scale: interpolate(local, [0, 1], [0.6, 1]) },
      ],
      opacity: local,
    };
  });

  const manualStyle = useAnimatedStyle(() => {
    const local = interpolate(
      progress.value,
      [0.2, 0.85],
      [0, 1],
      Extrapolate.CLAMP,
    );
    return {
      transform: [
        { translateY: interpolate(local, [0, 1], [0, -SECOND_OFFSET]) },
        { scale: interpolate(local, [0, 1], [0.6, 1]) },
      ],
      opacity: local,
    };
  });

  const cameraGlyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0.92]),
  }));

  return (
    <>
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, backdropStyle]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={25}
            tint="systemMaterial"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.35)' },
            ]}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0,0,0,0.06)' },
          ]}
        />
        <RNPressable
          style={StyleSheet.absoluteFill}
          onPress={close}
        />
      </Animated.View>

      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[styles.miniRow, { bottom }, manualStyle]}
      >
        <View style={styles.label}>
          <Text style={styles.labelText}>Manual</Text>
        </View>
        <RNPressable
          onPress={fireManual}
          style={({ pressed }) => [
            styles.miniFab,
            pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
          ]}
        >
          <PencilIcon size={22} color="#fff" />
        </RNPressable>
      </Animated.View>

      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[styles.miniRow, { bottom }, libraryStyle]}
      >
        <View style={styles.label}>
          <Text style={styles.labelText}>Library</Text>
        </View>
        <RNPressable
          onPress={fireLibrary}
          style={({ pressed }) => [
            styles.miniFab,
            pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
          ]}
        >
          <LibraryIcon size={22} color="#fff" />
        </RNPressable>
      </Animated.View>

      <RNPressable
        style={({ pressed }) => [
          styles.mainFab,
          { bottom },
          pressed && { opacity: 0.92, transform: [{ scale: 0.94 }] },
        ]}
        onPress={fireCamera}
        onLongPress={open}
        delayLongPress={280}
        hitSlop={8}
      >
        <Animated.View style={cameraGlyphStyle}>
          <CameraIcon size={28} color="#fff" />
        </Animated.View>
      </RNPressable>
    </>
  );
}

function LibraryIcon({
  size = 22,
  color = '#fff',
}: {
  size?: number;
  color?: string;
}) {
  const stroke = Math.max(1.6, size * 0.1);
  const inner = size * 0.78;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: inner,
          height: inner,
          borderRadius: size * 0.18,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: inner,
          height: inner,
          borderRadius: size * 0.18,
          borderWidth: stroke,
          borderColor: color,
          backgroundColor: theme.colors.accent,
        }}
      />
    </View>
  );
}

function PencilIcon({
  size = 22,
  color = '#fff',
}: {
  size?: number;
  color?: string;
}) {
  const stroke = Math.max(1.6, size * 0.11);
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.22,
          height: size * 0.95,
          borderRadius: stroke * 0.6,
          borderWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainFab: {
    position: 'absolute',
    right: 22,
    width: MAIN_SIZE,
    height: MAIN_SIZE,
    borderRadius: MAIN_SIZE / 2,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  miniRow: {
    position: 'absolute',
    right: 22 + (MAIN_SIZE - MINI_SIZE) / 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniFab: {
    width: MINI_SIZE,
    height: MINI_SIZE,
    borderRadius: MINI_SIZE / 2,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  label: {
    marginRight: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  labelText: {
    ...theme.type.label,
    color: theme.colors.text,
    fontWeight: '600',
  },
});
