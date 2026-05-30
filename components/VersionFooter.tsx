import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import * as Updates from 'expo-updates';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Pressable } from './Pressable';
import { theme } from '../lib/theme';
import { haptic } from '../lib/haptics';

// Salt Lake City / Mountain Time. Auto-shifts between MST/MDT.
const TZ = 'America/Denver';

function formatSLC(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

export function VersionFooter() {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    null;
  const channel = Updates.channel ?? 'dev';
  const updateId = Updates.updateId;
  const createdAt = Updates.createdAt;
  const isEmbedded = Updates.isEmbeddedLaunch;

  const sourceLabel = isEmbedded ? 'Bundled with build' : 'OTA update';
  const timeStr = createdAt ? formatSLC(createdAt) : null;
  const idShort = updateId ? updateId.slice(0, 8) : null;

  const versionLine = `Manila ${version}${buildNumber ? ` (build ${buildNumber})` : ''} · ${channel}`;
  const sourceLine = timeStr ? `${sourceLabel} · ${timeStr}` : sourceLabel;

  const [copied, setCopied] = useState(false);

  async function copy() {
    const summary = [versionLine, sourceLine, idShort].filter(Boolean).join(' · ');
    await Clipboard.setStringAsync(summary);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Pressable
      onPress={copy}
      scaleTo={1}
      style={styles.wrap}
      hapticOnPress="none"
    >
      <Text style={styles.text}>{versionLine}</Text>
      <Text style={styles.subtle}>{sourceLine}</Text>
      {idShort && <Text style={styles.id}>{idShort}</Text>}
      <Text style={styles.hint}>{copied ? 'Copied ✓' : 'Tap to copy'}</Text>
    </Pressable>
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
  hint: {
    ...theme.type.label,
    color: theme.colors.textSubtle,
    fontSize: 10,
    marginTop: 8,
    letterSpacing: 0.3,
  },
});
