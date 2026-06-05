import * as Updates from 'expo-updates';

export type AvailableUpdate = {
  /** Human-friendly label for the waiting update, e.g. "v0.1.2". */
  versionName: string;
};

/**
 * Checks Expo's update server for a newer OTA bundle than the one currently
 * running. Returns details about the waiting update, or null if there's none
 * (or if updates aren't active, e.g. in Expo Go or a dev build).
 *
 * Never throws — a failed/offline check just resolves to null so the app can
 * quietly try again on the next launch.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  // Updates only run in real builds (TestFlight / App Store / Play). In Expo
  // Go and dev builds they're disabled, so there's nothing to check.
  if (__DEV__ || !Updates.isEnabled) return null;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return null;
    // The incoming update carries the app config under extra.expoClient, so we
    // can surface the version it declares. Fall back gracefully if it's absent.
    const manifest = result.manifest as
      | { extra?: { expoClient?: { version?: string } }; runtimeVersion?: string }
      | undefined;
    const version =
      manifest?.extra?.expoClient?.version ?? manifest?.runtimeVersion ?? null;
    return { versionName: version ? `v${version}` : 'New version' };
  } catch {
    return null;
  }
}

/**
 * Downloads the waiting update and restarts the app into it. Throws if the
 * download fails so the caller can surface an error.
 */
export async function downloadAndReload(): Promise<void> {
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
}
