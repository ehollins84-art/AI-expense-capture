import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { theme } from '../lib/theme';

// Salt Lake City / Mountain Time. Auto-shifts between MST/MDT.
const TZ = 'America/Denver';

export function VersionFooter() {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const channel = Updates.channel ?? 'dev';
  const updateId = Updates.updateId;
  const createdAt = Updates.createdAt;
  const isEmbedded = Updates.isEmbeddedLaunch;

  let timeLine: string;
  if (createdAt) {
    timeLine =
      'Updated ' +
      createdAt.toLocaleString('en-US', {
        timeZone: TZ,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });
  } else if (isEmbedded) {
    timeLine = 'Bundled build (no OTA applied)';
  } else {
    timeLine = 'No update info';
  }

  const idShort = updateId ? updateId.slice(0, 8) : null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        Manila {version} · {channel}
      </Text>
      <Text style={styles.subtle}>{timeLine}</Text>
      {idShort && <Text style={styles.id}>{idShort}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  text: {
    ...theme.type.label,
    color: theme.colors.textMuted,
  },
  subtle: {
    ...theme.type.label,
    color: theme.colors.textSubtle,
    marginTop: 4,
  },
  id: {
    ...theme.type.label,
    color: theme.colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});
