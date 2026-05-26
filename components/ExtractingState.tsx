import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { theme } from '../lib/theme';

// Steps progress through ONCE — they don't loop. Step 5 ("Almost there…") is
// the indefinite hold state when extraction takes longer than the scripted
// runtime, instead of cycling back to step 0 (which broke the illusion).
const STEPS = [
  'Sending photo to AI…',
  'Reading the receipt…',
  'Finding the merchant…',
  'Pulling the total…',
  'Picking a category…',
  'Almost there…',
];
const STEP_DURATIONS = [1200, 1300, 1300, 1300, 1300]; // ms per scripted step
const HOLD_STEP = STEPS.length - 1;
const DOT_COUNT = STEPS.length - 1; // 5 dots; the hold state doesn't get a dot

export function ExtractingState({ imageUri }: { imageUri: string | null }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  useEffect(() => {
    if (stepIndex >= HOLD_STEP) return; // hold indefinitely
    const t = setTimeout(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        setStepIndex((i) => Math.min(i + 1, HOLD_STEP));
        Animated.timing(fade, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      });
    }, STEP_DURATIONS[stepIndex] ?? 1300);
    return () => clearTimeout(t);
  }, [stepIndex]);

  const sweepY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 280],
  });

  const isHold = stepIndex >= HOLD_STEP;

  return (
    <View style={styles.wrap}>
      <View style={styles.imageFrame}>
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="cover"
          />
        )}
        <Animated.View
          pointerEvents="none"
          style={[styles.sweep, { transform: [{ translateY: sweepY }] }]}
        />
        <View pointerEvents="none" style={styles.corner_tl} />
        <View pointerEvents="none" style={styles.corner_tr} />
        <View pointerEvents="none" style={styles.corner_bl} />
        <View pointerEvents="none" style={styles.corner_br} />
      </View>

      <Animated.Text style={[styles.stepText, { opacity: fade }]}>
        {STEPS[stepIndex]}
      </Animated.Text>

      <View style={styles.dots}>
        {Array.from({ length: DOT_COUNT }, (_, i) => {
          // While scripted, the current dot is active (wide); earlier dots are
          // completed (filled narrow); later dots are upcoming (grey).
          // While holding, every dot shows as completed.
          let state: 'completed' | 'active' | 'upcoming';
          if (isHold) state = 'completed';
          else if (i < stepIndex) state = 'completed';
          else if (i === stepIndex) state = 'active';
          else state = 'upcoming';

          return (
            <View
              key={i}
              style={[
                styles.dot,
                state === 'active' && styles.dotActive,
                state === 'completed' && styles.dotCompleted,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const IMG_W = 220;
const IMG_H = 280;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  imageFrame: {
    width: IMG_W,
    height: IMG_H,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  sweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: 'rgba(198, 99, 58, 0.18)',
    borderTopWidth: 1.5,
    borderTopColor: theme.colors.accent,
  },
  corner_tl: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 18,
    height: 18,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: theme.colors.accent,
  },
  corner_tr: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: theme.colors.accent,
  },
  corner_bl: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 18,
    height: 18,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: theme.colors.accent,
  },
  corner_br: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 18,
    height: 18,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: theme.colors.accent,
  },
  stepText: {
    ...theme.type.body,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    textAlign: 'center',
    minHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: theme.spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
  },
  dotCompleted: {
    backgroundColor: theme.colors.accent,
  },
  dotActive: {
    backgroundColor: theme.colors.accent,
    width: 18,
  },
});
