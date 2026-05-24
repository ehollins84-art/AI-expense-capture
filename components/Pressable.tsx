import React from 'react';
import {
  Pressable as RNPressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  pressedOpacity?: number;
};

export function Pressable({ style, pressedOpacity = 0.6, ...rest }: Props) {
  return (
    <RNPressable
      {...rest}
      style={({ pressed }) => [style, pressed && { opacity: pressedOpacity }]}
    />
  );
}
