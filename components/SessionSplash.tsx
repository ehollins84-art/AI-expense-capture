import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../lib/theme';

// Minimum time the splash stays on screen, even if the app finishes loading
// instantly. Without this, fast devices would just flash the baby for a frame
// and the moment would be lost. 1.2s is enough to register without feeling slow.
const MIN_VISIBLE_MS = 1200;
// How long the splash takes to fade out once it's allowed to leave.
const FADE_OUT_MS = 400;

export function SessionSplash({ ready }: { ready: boolean }) {
  const mountedAt = React.useRef(Date.now()).current;
  const opacity = useSharedValue(1);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const elapsed = Date.now() - mountedAt;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, {
        duration: FADE_OUT_MS,
        easing: Easing.out(Easing.quad),
      });
      // Unmount after the fade finishes. (Reanimated's completion callback
      // fires on the UI thread, so a plain JS timer is simpler than runOnJS.)
      setTimeout(() => setRemoved(true), FADE_OUT_MS);
    }, remaining);
    return () => clearTimeout(timer);
  }, [ready, mountedAt, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (removed) return null;

  return (
    <Animated.View
      pointerEvents={ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.container, animated]}
    >
      <View style={styles.content}>
        <Image
          source={require('../assets/baby.png')}
          style={styles.baby}
          resizeMode="contain"
        />
        <Text style={styles.wordmark}>Manila</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  baby: {
    width: 260,
    height: 260,
    marginBottom: theme.spacing.xl,
  },
  wordmark: {
    fontSize: 38,
    fontWeight: '600',
    letterSpacing: -0.5,
    color: theme.colors.text,
  },
});
