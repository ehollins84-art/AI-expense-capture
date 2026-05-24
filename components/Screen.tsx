import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';

export function Screen({
  children,
  style,
  edges = ['top', 'bottom'],
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
}) {
  return (
    <SafeAreaView
      edges={edges}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </SafeAreaView>
  );
}
