import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { theme } from '../lib/theme';

export function Card({
  children,
  style,
  elevated = false,
  flat = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** When true, applies the floating shadow. */
  elevated?: boolean;
  /** When true, removes border and shadow (used inside other surfaces). */
  flat?: boolean;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: flat ? 0 : StyleHairlineFix,
          borderColor: theme.colors.divider,
        },
        elevated && theme.shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// 1 logical pixel border – the divider tint already handles contrast,
// so we keep it as 1 instead of StyleSheet.hairlineWidth to render reliably
// across iOS/Android at all densities.
const StyleHairlineFix = 1;
