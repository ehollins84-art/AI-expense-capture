import React, { useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable as RNPressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { haptic } from '../lib/haptics';

type HapticKind = 'select' | 'light' | 'medium' | 'success' | 'warning' | 'error' | 'none';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  pressedOpacity?: number;
  scaleTo?: number;
  hapticOnPress?: HapticKind;
  ripple?: boolean;
};

export function Pressable({
  style,
  pressedOpacity = 0.85,
  scaleTo = 0.97,
  hapticOnPress = 'none',
  ripple = true,
  onPressIn,
  onPressOut,
  onPress,
  android_ripple,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <RNPressable
        {...rest}
        android_ripple={
          ripple && Platform.OS === 'android'
            ? android_ripple ?? { color: 'rgba(0,0,0,0.08)', borderless: false }
            : undefined
        }
        onPressIn={(e) => {
          Animated.spring(scale, {
            toValue: scaleTo,
            useNativeDriver: true,
            speed: 40,
            bounciness: 0,
          }).start();
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 30,
            bounciness: 6,
          }).start();
          onPressOut?.(e);
        }}
        onPress={(e) => {
          if (hapticOnPress !== 'none') haptic[hapticOnPress]();
          onPress?.(e);
        }}
        style={({ pressed }) => [style, pressed && { opacity: pressedOpacity }]}
      />
    </Animated.View>
  );
}
