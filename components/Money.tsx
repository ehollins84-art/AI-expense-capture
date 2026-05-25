import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { theme } from '../lib/theme';

type Size = 'hero' | 'md' | 'sm' | 'body';

const sizeStyle: Record<Size, TextStyle> = {
  hero: theme.type.numeral,
  md: theme.type.numeralMd,
  sm: theme.type.numeralSm,
  body: { ...theme.type.body, fontVariant: ['tabular-nums'] },
};

export function Money({
  amount,
  currency = 'USD',
  size = 'sm',
  compact = false,
  style,
  color,
}: {
  amount: number;
  currency?: string;
  size?: Size;
  /** Hide cents when true (used for hero totals). */
  compact?: boolean;
  style?: StyleProp<TextStyle>;
  color?: string;
}) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  });
  let text: string;
  try {
    text = formatter.format(amount);
  } catch {
    text = `${currency} ${amount.toFixed(compact ? 0 : 2)}`;
  }
  return (
    <Text
      style={[
        sizeStyle[size],
        { color: color ?? theme.colors.text },
        style,
      ]}
      allowFontScaling
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}
