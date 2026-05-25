import React, { useCallback } from 'react';
import {
  Pressable as RNPressable,
  PressableProps,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { motion } from '../lib/motion';

type HapticKind = 'selection' | 'light' | 'medium' | 'success';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale factor on press-in. Default 0.97. Set 1 to disable. */
  pressScale?: number;
  /** Optional opacity dim on press. Default 1 (off). */
  pressedOpacity?: number;
  /** Optional haptic on press-in. */
  haptic?: HapticKind;
};

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

function fireHaptic(kind: HapticKind) {
  switch (kind) {
    case 'selection':
      Haptics.selectionAsync();
      return;
    case 'light':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    case 'medium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
  }
}

export function Pressable({
  style,
  pressScale = 0.97,
  pressedOpacity = 1,
  haptic,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(pressScale, motion.spring.snappy);
      if (pressedOpacity !== 1) opacity.value = pressedOpacity;
      if (haptic) fireHaptic(haptic);
      onPressIn?.(e);
    },
    [haptic, onPressIn, opacity, pressScale, pressedOpacity, scale],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(1, motion.spring.snappy);
      opacity.value = 1;
      onPressOut?.(e);
    },
    [onPressOut, opacity, scale],
  );

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
}
