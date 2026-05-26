import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { theme } from '../lib/theme';

export function BlinkingCursor({
  height = 22,
  color = theme.colors.accent,
}: {
  height?: number;
  color?: string;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 530,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 530,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.bar,
          { height, backgroundColor: color, opacity },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingLeft: 2,
    justifyContent: 'center',
  },
  bar: {
    width: 2,
    borderRadius: 1,
  },
});
