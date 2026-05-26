import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { formatMoney, moneyTextStyle } from '../lib/format';
import { theme } from '../lib/theme';

// A one-shot animated total: fades + slides up on mount, and tweens the
// numeric value from 0 to the target over ~620ms with an ease-out curve.
// Used in drill-down views where the number is static once shown — for a
// continuously-updating number, use MorphingMoney instead.
export function AnimatedTotal({
  amount,
  currency,
  fontSize = 64,
  color = theme.colors.text,
}: {
  amount: number;
  currency: string;
  fontSize?: number;
  color?: string;
}) {
  const v = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    v.value = 0;
    v.value = withTiming(amount, {
      duration: 620,
      easing: Easing.out(Easing.cubic),
    });
  }, [amount]);

  useAnimatedReaction(
    () => v.value,
    (latest) => {
      runOnJS(setDisplay)(latest);
    },
  );

  return (
    <Animated.View entering={FadeInUp.duration(360)}>
      <Text
        style={[
          styles.text,
          moneyTextStyle,
          {
            fontSize,
            color,
            lineHeight: Math.round(fontSize * 1.05),
          },
        ]}
      >
        {formatMoney(display, currency)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  text: {
    fontWeight: '700',
    letterSpacing: -1.2,
  },
});
