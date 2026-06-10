import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable as RNPressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { Pressable } from './Pressable';
import { CameraIcon } from './CameraIcon';
import { theme } from '../lib/theme';
import { haptic } from '../lib/haptics';
import { ensureMediaLibraryReadPermission } from '../lib/permissions';

const RECENT_COUNT = 24;
const TILE = 96;

// Lets us animate the backdrop's opacity independently of the sliding card.
const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * A Gemini-style "add a receipt" bottom sheet. Tapping the capture button
 * opens this; it shows a camera tile alongside a strip of the user's recent
 * photos they can tap directly, plus fallbacks to the full library and manual
 * entry. Works identically on iOS and Android.
 */
export function ImportSheet({
  visible,
  onClose,
  onCamera,
  onLibrary,
  onManual,
  onPickImage,
}: {
  visible: boolean;
  onClose: () => void;
  onCamera: () => void;
  onLibrary: () => void;
  onManual: () => void;
  onPickImage: (uri: string) => void;
}) {
  const [photos, setPhotos] = useState<MediaLibrary.Asset[]>([]);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>(
    'unknown',
  );
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);

  // Animation: the backdrop fades while only the card slides up from the
  // bottom, instead of sliding the whole gray overlay (which looked jarring).
  // `render` keeps the modal mounted long enough to play the closing slide.
  const [render, setRender] = useState(visible);
  const [sheetH, setSheetH] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRender(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRender(false);
      });
    }
  }, [visible, anim]);

  // Card starts one card-height below the screen and rises to rest. Falls back
  // to a sensible offset until the card has measured its own height.
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetH || 420, 0],
  });

  // Load recent photos each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ok = await ensureMediaLibraryReadPermission();
      if (cancelled) return;
      if (!ok) {
        setPermission('denied');
        setLoading(false);
        return;
      }
      setPermission('granted');
      try {
        const result = await MediaLibrary.getAssetsAsync({
          first: RECENT_COUNT,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        if (!cancelled) setPhotos(result.assets);
      } catch {
        if (!cancelled) setPhotos([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // A photo's `uri` can be a ph:// reference on iOS that the rest of the app
  // can't read directly, so resolve the real on-disk path before handing it off.
  async function pickPhoto(asset: MediaLibrary.Asset) {
    if (resolving) return;
    setResolving(true);
    haptic.light();
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      onPickImage(info.localUri ?? asset.uri);
    } catch {
      onPickImage(asset.uri);
    } finally {
      setResolving(false);
    }
  }

  return (
    <Modal
      visible={render}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Backdrop fades in/out; tapping it closes the sheet. */}
        <AnimatedPressable
          style={[styles.scrim, { opacity: anim }]}
          onPress={onClose}
        />
        {/* Only the card slides up; it measures its own height for the slide. */}
        <Animated.View
          style={[styles.card, { transform: [{ translateY }] }]}
          onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Add a receipt</Text>

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={photos}
            keyExtractor={(a) => a.id}
            contentContainerStyle={styles.strip}
            ListHeaderComponent={
              <Pressable
                onPress={() => {
                  haptic.medium();
                  onCamera();
                }}
                style={[styles.tile, styles.cameraTile]}
                scaleTo={0.96}
              >
                <CameraIcon size={28} color="#fff" />
                <Text style={styles.cameraTileText}>Camera</Text>
              </Pressable>
            }
            ListEmptyComponent={
              loading ? (
                <View style={[styles.tile, styles.emptyTile]}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              ) : (
                <View style={[styles.tile, styles.emptyTile]}>
                  <Text style={styles.emptyText}>
                    {permission === 'denied'
                      ? 'No photo access'
                      : 'No recent photos'}
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pickPhoto(item)}
                style={styles.tile}
                scaleTo={0.96}
              >
                <Image
                  source={{ uri: item.uri }}
                  style={styles.thumb}
                  contentFit="cover"
                />
              </Pressable>
            )}
          />

          <View style={styles.actions}>
            <Pressable
              style={styles.actionBtn}
              hapticOnPress="select"
              onPress={onLibrary}
              scaleTo={1}
            >
              <Text style={styles.actionText}>Choose from Library</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              hapticOnPress="select"
              onPress={onManual}
              scaleTo={1}
            >
              <Text style={styles.actionText}>Enter manually</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingTop: 8,
    paddingBottom: theme.spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  strip: {
    paddingHorizontal: theme.spacing.lg,
    gap: 10,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceAlt,
  },
  cameraTile: {
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cameraTileText: {
    ...theme.type.label,
    color: '#fff',
    fontWeight: '600',
  },
  emptyTile: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  emptyText: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  thumb: {
    width: TILE,
    height: TILE,
  },
  actions: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    gap: 10,
  },
  actionBtn: {
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
});
