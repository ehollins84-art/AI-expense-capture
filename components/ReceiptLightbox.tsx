import React, { useRef } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Pressable';
import { theme } from '../lib/theme';

export function ReceiptLightbox({
  visible,
  uri,
  onClose,
}: {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const lastTap = useRef(0);
  const { width, height } = Dimensions.get('window');

  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      scrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <ScrollView
          ref={scrollRef}
          maximumZoomScale={4}
          minimumZoomScale={1}
          bouncesZoom
          pinchGestureEnabled
          contentContainerStyle={{
            width,
            height,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={handleDoubleTap}
            scaleTo={1}
            ripple={false}
            style={{ width, height, alignItems: 'center', justifyContent: 'center' }}
          >
            {uri && (
              <Image
                source={{ uri }}
                style={{ width, height: height * 0.9 }}
                contentFit="contain"
              />
            )}
          </Pressable>
        </ScrollView>

        <Pressable
          onPress={onClose}
          hapticOnPress="select"
          scaleTo={1}
          style={[
            styles.closeBtn,
            { top: insets.top + 8 },
          ]}
          hitSlop={12}
        >
          <Text style={styles.closeText}>Done</Text>
        </Pressable>

        <View style={[styles.hint, { bottom: insets.bottom + 18 }]} pointerEvents="none">
          <Text style={styles.hintText}>
            {Platform.OS === 'ios' ? 'Pinch to zoom · double-tap to reset' : 'Pinch to zoom'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  closeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
});
