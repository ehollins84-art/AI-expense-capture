import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

// Wraps the ImagePicker permission flow with a friendly fallback:
//  - First call ever → iOS shows its native prompt
//  - User previously denied → we show our own alert with an "Open Settings"
//    button (iOS hides Camera/Photos rows from the app's Settings page until
//    the app has at least requested permission once, so deep-linking to
//    Settings is the only path back)
//  - Granted → returns true, caller proceeds.

export async function ensureCameraPermission(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    if (result.granted) return true;
  }
  promptOpenSettings(
    'Camera access needed',
    'Manila needs the camera to capture receipts. Tap Open Settings and turn Camera on.',
  );
  return false;
}

export async function ensureLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (result.granted) return true;
  }
  promptOpenSettings(
    'Photo access needed',
    'Manila needs access to your photos to import existing receipts. Tap Open Settings and turn Photos on.',
  );
  return false;
}

/**
 * Read-only access to the photo library, used to show recent-photo thumbnails
 * in the import sheet. Returns true if we can read photos (full or limited
 * access on iOS). Never throws.
 */
export async function ensureMediaLibraryReadPermission(): Promise<boolean> {
  try {
    const current = await MediaLibrary.getPermissionsAsync();
    if (current.granted || current.accessPrivileges === 'limited') return true;
    if (current.canAskAgain) {
      const result = await MediaLibrary.requestPermissionsAsync();
      if (result.granted || result.accessPrivileges === 'limited') return true;
    }
    return false;
  } catch {
    return false;
  }
}

function promptOpenSettings(title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => Linking.openSettings() },
  ]);
}
