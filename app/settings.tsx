import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Screen } from '../components/Screen';
import { Pressable } from '../components/Pressable';
import { useStore } from '../lib/store';
import { theme } from '../lib/theme';
import { labelForScheme } from '../lib/categories';
import {
  checkConcurrentDevice,
  clearAuth,
  fetchUserEmail,
  getStoredEmail,
  isConnected,
  listRemoteIterations,
  saveAuth,
  setStoredIteration,
  type ImportProgress,
} from '../lib/drive';
import { listIterations, nextIterationLetter } from '../lib/storage';
import { claudeConfigured } from '../lib/claude';
import { haptic } from '../lib/haptics';
import * as Clipboard from 'expo-clipboard';
import { VersionFooter } from '../components/VersionFooter';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ??
  (Constants.expoConfig?.extra?.googleClientId as string | undefined) ??
  '';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export default function Settings() {
  const router = useRouter();
  const { iteration, setIteration, projects, importFromDrive, refresh } =
    useStore();
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const [debugVisible, setDebugVisible] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const googleConfigured = !!GOOGLE_CLIENT_ID;

  async function copyRedirectUri() {
    await Clipboard.setStringAsync(redirectUri);
    haptic.success();
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 1600);
  }

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'manila',
    path: 'redirect',
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
    discovery,
  );

  useEffect(() => {
    getStoredEmail().then(setDriveEmail);
  }, []);

  useEffect(() => {
    if (!response) return;
    if (response.type === 'error') {
      Alert.alert('Sign-in failed', response.error?.message ?? 'Unknown error');
      setConnecting(false);
      return;
    }
    if (response.type !== 'success' || !response.params.code) {
      setConnecting(false);
      return;
    }
    if (!request?.codeVerifier) {
      Alert.alert('Sign-in failed', 'Missing PKCE verifier.');
      setConnecting(false);
      return;
    }
    (async () => {
      try {
        const tokenResult = await AuthSession.exchangeCodeAsync(
          {
            clientId: GOOGLE_CLIENT_ID,
            code: response.params.code,
            redirectUri,
            extraParams: { code_verifier: request.codeVerifier as string },
          },
          discovery,
        );
        await saveAuth({
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken ?? null,
          expiresInSeconds: tokenResult.expiresIn ?? 3600,
        });
        const email = (await fetchUserEmail(tokenResult.accessToken)) ?? undefined;
        if (email) await saveAuth(
          {
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken ?? null,
            expiresInSeconds: tokenResult.expiresIn ?? 3600,
          },
          email,
        );
        setDriveEmail(email ?? null);
        await maybeOfferImport();
      } catch (e) {
        Alert.alert(
          'Sign-in failed',
          e instanceof Error ? e.message : String(e),
        );
      } finally {
        setConnecting(false);
      }
    })();
  }, [response]);

  async function maybeOfferImport() {
    const remote = await listRemoteIterations();
    const local = await listIterations();
    const localHasData = local.length > 0;
    const remoteHasData = remote.length > 0;
    if (!remoteHasData) return;

    if (!localHasData) {
      const latest = remote[remote.length - 1];
      const warning = await checkConcurrentDevice(latest);
      const concurrentNote = warning
        ? `\n\nNote: another device wrote to backup ${latest} ${formatAge(warning.ageMs)} ago. Avoid editing on both devices.`
        : '';
      Alert.alert(
        'Restore from Drive?',
        `Backup${remote.length > 1 ? 's' : ''} ${remote.join(', ')} found in your Drive.${concurrentNote}`,
        [
          {
            text: 'Import latest',
            onPress: () => runImport(latest),
          },
          {
            text: 'Start fresh',
            style: 'destructive',
            onPress: async () => {
              const next = await nextIterationLetter();
              const start = remote.includes(next)
                ? String.fromCharCode(
                    remote[remote.length - 1].charCodeAt(0) + 1,
                  )
                : next;
              await setIteration(start);
              await setStoredIteration(start);
            },
          },
        ],
      );
    }
  }

  async function runImport(iter: string) {
    await setStoredIteration(iter);
    await setIteration(iter);
    setImportProgress({
      phase: 'discovering',
      current: 0,
      total: 0,
      message: 'Starting…',
    });
    try {
      const result = await importFromDrive(iter, setImportProgress);
      await refresh();
      const detail =
        `Imported ${result.projects.length} project${result.projects.length === 1 ? '' : 's'}` +
        ` and ${result.expenses.length} expense${result.expenses.length === 1 ? '' : 's'}.` +
        (result.skipped ? ` Skipped ${result.skipped} already present.` : '') +
        (result.lossy.length
          ? `\n\nIssues:\n${result.lossy.slice(0, 6).join('\n')}${result.lossy.length > 6 ? `\n…and ${result.lossy.length - 6} more.` : ''}`
          : '');
      Alert.alert('Import complete', detail);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setImportProgress(null);
    }
  }

  async function handleConnect() {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert(
        'Google Drive isn\'t set up',
        'This build is missing the Google Drive credentials needed to sign in. Long-press the Settings title for setup details.',
      );
      return;
    }
    setConnecting(true);
    await promptAsync();
  }

  async function handleDisconnect() {
    Alert.alert(
      'Disconnect Google Drive?',
      'New expenses will be saved locally only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await clearAuth();
            setDriveEmail(null);
          },
        },
      ],
    );
  }

  async function handleManualImport() {
    if (!(await isConnected())) {
      Alert.alert('Not connected', 'Connect Google Drive first.');
      return;
    }
    const remote = await listRemoteIterations();
    if (remote.length === 0) {
      Alert.alert('Nothing on Drive', 'No backups found in your Drive.');
      return;
    }
    Alert.alert(
      'Import from Drive',
      `Found backup${remote.length > 1 ? 's' : ''} ${remote.join(', ')}. Importing merges anything new into your local data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...remote.map((it) => ({
          text: `Import backup ${it}`,
          onPress: () => runImport(it),
        })),
      ],
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hapticOnPress="select"
          hitSlop={12}
          scaleTo={1}
        >
          <Text style={styles.cancelText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          onLongPress={() => {
            haptic.medium();
            setDebugVisible((v) => !v);
          }}
          delayLongPress={600}
          scaleTo={1}
        >
          <Text style={styles.heading}>Settings</Text>
        </Pressable>

        <Section title="Projects">
          {projects.length === 0 ? (
            <Card>
              <Text style={styles.value}>No projects yet.</Text>
            </Card>
          ) : (
            projects.map((p) => (
              <Pressable
                key={p.id}
                style={styles.projectCard}
                hapticOnPress="select"
                scaleTo={0.98}
                onPress={() =>
                  router.push({
                    pathname: '/projects/[id]',
                    params: { id: p.id },
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.projectName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.projectMeta}>{labelForScheme(p.scheme)}</Text>
                </View>
                <Text style={styles.projectChevron}>›</Text>
              </Pressable>
            ))
          )}
          <Pressable
            style={[styles.btn, styles.btnGhost, { marginTop: theme.spacing.sm }]}
            hapticOnPress="select"
            onPress={() => router.push('/projects/new')}
          >
            <Text style={styles.btnGhostText}>+ New project</Text>
          </Pressable>
        </Section>

        <Section title="AI">
          <Card>
            <Text style={styles.label}>Receipt reading</Text>
            <Text style={styles.value}>
              {claudeConfigured()
                ? 'Set up — receipts are read automatically.'
                : "Not set up — you'll fill in receipt details by hand."}
            </Text>
          </Card>
        </Section>

        <Section title="Backup">
          <Card>
            <Text style={styles.label}>Current backup</Text>
            <Text style={styles.iteration}>{iteration}</Text>
            <Text style={styles.hint}>
              Everything you've captured is grouped under backup {iteration}.
              On a new phone, connect Drive and choose Import to bring it
              back — or Start fresh to begin a new lettered backup.
            </Text>
          </Card>
        </Section>

        <Section title="Cloud sync">
          <Card>
            {driveEmail ? (
              <>
                <Text style={styles.label}>Connected</Text>
                <Text style={styles.value}>{driveEmail}</Text>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  hapticOnPress="select"
                  onPress={handleManualImport}
                >
                  <Text style={styles.btnGhostText}>Import from Drive</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  hapticOnPress="select"
                  onPress={handleDisconnect}
                >
                  <Text style={styles.btnGhostText}>Disconnect</Text>
                </Pressable>
              </>
            ) : googleConfigured ? (
              <>
                <Text style={styles.label}>Google Drive</Text>
                <Text style={styles.value}>
                  Back up your receipts and metadata to your own Drive. Sign
                  in once and we'll keep everything in sync.
                </Text>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  hapticOnPress="light"
                  onPress={handleConnect}
                  disabled={connecting || !request}
                >
                  <Text style={styles.btnPrimaryText}>
                    {connecting ? 'Connecting…' : 'Connect Google Drive'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>Setup needed</Text>
                <Text style={styles.value}>
                  Google Drive backup is built in, but Google needs to know
                  about this app first. Create an OAuth client in Google
                  Cloud Console and paste its Client ID into the app's
                  config. You'll need this redirect URI on Google's side:
                </Text>
                <View style={styles.redirectBox}>
                  <Text style={styles.mono} numberOfLines={2}>
                    {redirectUri}
                  </Text>
                </View>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  hapticOnPress="success"
                  onPress={copyRedirectUri}
                >
                  <Text style={styles.btnPrimaryText}>
                    {copiedRedirect ? 'Copied ✓' : 'Copy redirect URI'}
                  </Text>
                </Pressable>
              </>
            )}
          </Card>
        </Section>

        {debugVisible && (
          <Section title="Developer">
            <Card>
              <Text style={styles.label}>Google OAuth redirect URI</Text>
              <View style={styles.redirectBox}>
                <Text style={styles.mono} numberOfLines={2}>
                  {redirectUri}
                </Text>
              </View>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                hapticOnPress="select"
                onPress={copyRedirectUri}
              >
                <Text style={styles.btnGhostText}>
                  {copiedRedirect ? 'Copied ✓' : 'Copy redirect URI'}
                </Text>
              </Pressable>
              <Text style={styles.hint}>
                Paste this into the authorized redirect URIs of your Google
                Cloud OAuth client.
              </Text>
            </Card>
            <Card>
              <Text style={styles.label}>Build info</Text>
              <Text style={styles.value}>Manila · v0.1.0</Text>
            </Card>
            <Card>
              <Text style={styles.label}>Google Client ID</Text>
              <Text style={styles.value}>
                {googleConfigured
                  ? `Set · ${GOOGLE_CLIENT_ID.slice(0, 12)}…`
                  : 'Not set'}
              </Text>
            </Card>
          </Section>
        )}

        <VersionFooter />
      </ScrollView>

      <Modal
        visible={importProgress !== null}
        transparent
        animationType="fade"
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.modalTitle}>
              {importProgress?.phase === 'projects'
                ? 'Importing projects'
                : importProgress?.phase === 'expenses'
                  ? 'Importing expenses'
                  : importProgress?.phase === 'done'
                    ? 'Wrapping up'
                    : 'Scanning Drive'}
            </Text>
            <Text style={styles.modalDetail} numberOfLines={2}>
              {importProgress?.message ?? ''}
            </Text>
            {importProgress && importProgress.total > 0 && (
              <Text style={styles.modalCount}>
                {importProgress.current} / {importProgress.total}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function formatAge(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: theme.spacing.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: theme.spacing.md,
  },
  cancelText: { ...theme.type.body, color: theme.colors.text },
  scroll: { padding: theme.spacing.lg, paddingTop: 0 },
  heading: {
    ...theme.type.display,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  projectName: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  projectMeta: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  projectChevron: {
    fontSize: 24,
    color: theme.colors.textSubtle,
    marginLeft: theme.spacing.sm,
  },
  label: { ...theme.type.label, color: theme.colors.textMuted, marginBottom: 4 },
  value: { ...theme.type.body, color: theme.colors.text },
  iteration: { ...theme.type.display, color: theme.colors.text },
  hint: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
  mono: { ...theme.type.mono, color: theme.colors.text },
  redirectBox: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  btn: {
    borderRadius: theme.radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  btnPrimary: { backgroundColor: theme.colors.text },
  btnPrimaryText: { color: theme.colors.bg, ...theme.type.bodyStrong },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btnGhostText: { color: theme.colors.text, ...theme.type.bodyStrong },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  modalTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  modalDetail: {
    ...theme.type.body,
    color: theme.colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  modalCount: {
    ...theme.type.label,
    color: theme.colors.textSubtle,
    marginTop: 4,
  },
});
