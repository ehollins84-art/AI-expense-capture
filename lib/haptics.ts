import { Platform } from 'react-native';
import * as H from 'expo-haptics';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  select() {
    if (!enabled) return;
    H.selectionAsync().catch(() => {});
  },
  light() {
    if (!enabled) return;
    H.impactAsync(H.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    if (!enabled) return;
    H.impactAsync(H.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success() {
    if (!enabled) return;
    H.notificationAsync(H.NotificationFeedbackType.Success).catch(() => {});
  },
  warning() {
    if (!enabled) return;
    H.notificationAsync(H.NotificationFeedbackType.Warning).catch(() => {});
  },
  error() {
    if (!enabled) return;
    H.notificationAsync(H.NotificationFeedbackType.Error).catch(() => {});
  },
};
