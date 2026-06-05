import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { theme } from '../lib/theme';
import { Pressable } from './Pressable';

export function Toast({
  visible,
  message,
  onHide,
  duration = 2400,
  action,
  dismissible = false,
}: {
  visible: boolean;
  message: string;
  onHide: () => void;
  duration?: number;
  action?: { label: string; onPress: () => void };
  /** When true, shows a small × so the user can dismiss the toast manually. */
  dismissible?: boolean;
}) {
  const translate = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    Animated.parallel([
      Animated.timing(translate, {
        toValue: 80,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => onHide());
  }

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.spring(translate, {
        toValue: 0,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    hideTimer.current = setTimeout(dismiss, duration);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible, duration]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { transform: [{ translateY: translate }], opacity },
      ]}
    >
      <View style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.text}>{message}</Text>
        {action && (
          <Pressable
            onPress={() => {
              if (hideTimer.current) clearTimeout(hideTimer.current);
              action.onPress();
              dismiss();
            }}
            hapticOnPress="light"
            hitSlop={8}
            scaleTo={1}
            style={styles.action}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        )}
        {dismissible && (
          <Pressable
            onPress={() => {
              if (hideTimer.current) clearTimeout(hideTimer.current);
              dismiss();
            }}
            hapticOnPress="select"
            hitSlop={8}
            scaleTo={1}
            style={styles.dismiss}
          >
            <Text style={styles.dismissText}>×</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 120,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
    marginRight: 10,
  },
  text: {
    color: theme.colors.bg,
    fontSize: 15,
    fontWeight: '600',
    paddingRight: 8,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginLeft: 4,
  },
  actionText: {
    color: theme.colors.accentSoft,
    fontSize: 15,
    fontWeight: '700',
  },
  dismiss: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  dismissText: {
    color: theme.colors.bg,
    fontSize: 20,
    fontWeight: '500',
    opacity: 0.7,
    marginTop: -2,
  },
});
