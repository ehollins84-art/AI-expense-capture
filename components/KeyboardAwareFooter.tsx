import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';

/**
 * A bottom action bar that stays glued just above the keyboard.
 *
 * Replaces the old `KeyboardAvoidingView` + `keyboardVerticalOffset` pattern,
 * which mis-measured inside iOS modal sheets and left the CTA hidden behind the
 * keyboard. `KeyboardStickyView` (from react-native-keyboard-controller) tracks
 * the real keyboard position on the native side, so the bar lands exactly above
 * the keyboard on both iOS and Android.
 *
 * When the keyboard is closed the bar rests at the bottom with the home-indicator
 * safe-area padding baked in. While the keyboard is open we cancel that bottom
 * inset via `offset.opened` so the bar sits flush above the keyboard instead of
 * floating a gap above it.
 */
export function KeyboardAwareFooter({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardStickyView offset={{ opened: insets.bottom }}>
      <View
        style={[
          styles.bar,
          { paddingBottom: theme.spacing.lg + insets.bottom },
          style,
        ]}
      >
        {children}
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
});
