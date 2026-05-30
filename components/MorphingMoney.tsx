import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { formatMoney, moneyTextStyle } from '../lib/format';
import { theme } from '../lib/theme';

const SPRING = { damping: 22, stiffness: 110, mass: 0.7 };
const ENTER_DURATION = 240;
const EXIT_DURATION = 180;

function DigitColumn({
  digit,
  slotHeight,
  fontSize,
  color,
}: {
  digit: number;
  slotHeight: number;
  fontSize: number;
  color: string;
}) {
  const translate = useSharedValue(-digit * slotHeight);

  useEffect(() => {
    translate.value = withSpring(-digit * slotHeight, SPRING);
  }, [digit, slotHeight]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: translate.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(ENTER_DURATION)}
      exiting={FadeOut.duration(EXIT_DURATION)}
      style={{ height: slotHeight, overflow: 'hidden' }}
    >
      <Animated.View style={animated}>
        {Array.from({ length: 10 }, (_, n) => (
          <Text
            key={n}
            style={[
              styles.glyph,
              moneyTextStyle,
              { color, fontSize, height: slotHeight, lineHeight: slotHeight },
            ]}
          >
            {n}
          </Text>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

function StaticGlyph({
  char,
  slotHeight,
  fontSize,
  color,
  animateInOut = true,
}: {
  char: string;
  slotHeight: number;
  fontSize: number;
  color: string;
  animateInOut?: boolean;
}) {
  const inner = (
    <Text
      style={[
        styles.glyph,
        moneyTextStyle,
        { color, fontSize, height: slotHeight, lineHeight: slotHeight },
      ]}
    >
      {char}
    </Text>
  );
  if (!animateInOut) {
    return <View style={{ height: slotHeight }}>{inner}</View>;
  }
  return (
    <Animated.View
      entering={FadeIn.duration(ENTER_DURATION)}
      exiting={FadeOut.duration(EXIT_DURATION)}
      style={{ height: slotHeight }}
    >
      {inner}
    </Animated.View>
  );
}

export function MorphingMoney({
  amount,
  currency = 'USD',
  fontSize = 56,
  color = theme.colors.text,
}: {
  amount: number;
  currency?: string;
  fontSize?: number;
  color?: string;
}) {
  // Non-USD currencies fall back to the static formatter — the digit-slide
  // implementation assumes a leading "$" + comma thousand separators.
  if (currency !== 'USD') {
    return (
      <Text
        style={[
          styles.glyph,
          moneyTextStyle,
          { color, fontSize, fontWeight: '600' as const, letterSpacing: -1 },
        ]}
      >
        {formatMoney(amount, currency)}
      </Text>
    );
  }

  const slotHeight = Math.round(fontSize * 1.15);
  const totalCents = Math.max(0, Math.round(amount * 100));
  const dollars = Math.floor(totalCents / 100);
  const centsValue = totalCents % 100;
  const sig = dollars === 0 ? 1 : Math.floor(Math.log10(dollars)) + 1;

  const dollarDigits: number[] = [];
  let n = dollars;
  for (let i = 0; i < sig; i++) {
    dollarDigits.push(n % 10);
    n = Math.floor(n / 10);
  }

  const items: React.ReactNode[] = [];

  items.push(
    <StaticGlyph
      key="sign"
      char="$"
      slotHeight={slotHeight}
      fontSize={fontSize}
      color={color}
      animateInOut={false}
    />,
  );

  for (let pos = sig - 1; pos >= 0; pos--) {
    if ((pos + 1) % 3 === 0 && pos < sig - 1) {
      items.push(
        <StaticGlyph
          key={`comma-${pos}`}
          char=","
          slotHeight={slotHeight}
          fontSize={fontSize}
          color={color}
        />,
      );
    }
    items.push(
      <DigitColumn
        key={`digit-${pos}`}
        digit={dollarDigits[pos]}
        slotHeight={slotHeight}
        fontSize={fontSize}
        color={color}
      />,
    );
  }

  // Cents: decimal point + tens digit + ones digit. Always shown (even at .00)
  // so the layout doesn't jump when crossing whole-dollar boundaries.
  items.push(
    <StaticGlyph
      key="dot"
      char="."
      slotHeight={slotHeight}
      fontSize={fontSize}
      color={color}
      animateInOut={false}
    />,
    <DigitColumn
      key="cents-tens"
      digit={Math.floor(centsValue / 10)}
      slotHeight={slotHeight}
      fontSize={fontSize}
      color={color}
    />,
    <DigitColumn
      key="cents-ones"
      digit={centsValue % 10}
      slotHeight={slotHeight}
      fontSize={fontSize}
      color={color}
    />,
  );

  return (
    <Animated.View
      layout={LinearTransition.duration(320)}
      style={styles.row}
    >
      {items}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  glyph: {
    fontWeight: '600',
    letterSpacing: -1,
    textAlign: 'center',
  },
});
