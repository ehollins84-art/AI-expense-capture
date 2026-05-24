import React, { useEffect, useState } from 'react';
import {
  Alert,
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
  clearAuth,
  fetchUserEmail,
  getStoredEmail,
  getStoredToken,
  listRemoteIterations,
  saveAuth,
  setStoredIteration,
} from '../lib/drive';
import { listIterations, nextIterationLetter } from '../lib/storage';
import { claudeConfigured } from '../lib/claude';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ??
  (Constants.expoConfig?.extra?.googleClientId as string | undefined) ??
  '';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export default function Settings() {
  const router = useRouter();
  const { iteration, setIteration, projects, refresh } = useStore();
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'scheduleeai',
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
      responseType: AuthSession.ResponseType.Token,
    },
    discovery,
  );

  useEffect(() => {
    getStoredEmail().then(setDriveEmail);
  }, []);

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) {
      const token = response.authentication.accessToken;
      (async () => {
        const email = (await fetchUserEmail(token)) ?? undefined;
        await saveAuth(token, email);
        setDriveEmail(email ?? null);
        await maybeOfferImport(token);
      })();
    } else if (response?.type === 'error') {
      Alert.alert(
        'Sign-in failed',
        response.error?.message ?? 'Unknown error',
      );
    }
    setConnecting(false);
  }, [response]);

  async function maybeOfferImport(token: string) {
    const remote = await listRemoteIterations(token);
    const local = await listIterations();
    const localHasData = local.length > 0;
    const remoteHasData = remote.length > 0;

    if (remoteHasData && !localHasData) {
      Alert.alert(
        'Existing data found',
        `We found iteration${remote.length > 1 ? 's' : ''} ${remote.join(', ')} in your Drive. We'll keep using "${remote[0]}".`,
        [
          {
            text: 'OK',
            onPress: async () => {
              await setIteration(remote[0]);
              await setStoredIteration(remote[0]);
            },
          },
          {
            text: 'Start fresh',
            style: 'destructive',
            onPress: async () => {
              const next = await nextIterationLetter();
              const start = remote.includes(next)
                ? String.fromCharCode(remote[remote.length - 1].charCodeAt(0) + 1)
                : next;
              await setIteration(start);
              await setStoredIteration(start);
            },
          },
        ],
      );
    }
  }

  async function handleConnect() {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert(
        'Google client ID missing',
        `Set EXPO_PUBLIC_GOOGLE_CLIENT_ID in your .env. Use this redirect URI when creating the OAuth client:\n\n${redirectUri}`,
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

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancelText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Settings</Text>

        <Section title="Cloud sync">
          <Card>
            {driveEmail ? (
              <>
                <Text style={styles.label}>Connected</Text>
                <Text style={styles.value}>{driveEmail}</Text>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  onPress={handleDisconnect}
                >
                  <Text style={styles.btnGhostText}>Disconnect</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>Google Drive</Text>
                <Text style={styles.value}>
                  Back up your receipts and metadata to your own Drive.
                </Text>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={handleConnect}
                  disabled={connecting || !request}
                >
                  <Text style={styles.btnPrimaryText}>
                    {connecting ? 'Connecting…' : 'Connect Google Drive'}
                  </Text>
                </Pressable>
              </>
            )}
          </Card>
        </Section>

        <Section title="Iteration">
          <Card>
            <Text style={styles.label}>Current</Text>
            <Text style={styles.iteration}>{iteration}</Text>
            <Text style={styles.hint}>
              All your data is stored under iteration {iteration}. If you ever
              move to a new device and don't want to import, a fresh iteration
              letter is created automatically.
            </Text>
          </Card>
        </Section>

        <Section title="Projects">
          {projects.length === 0 ? (
            <Card>
              <Text style={styles.value}>No projects yet.</Text>
            </Card>
          ) : (
            projects.map((p) => (
              <Card key={p.id}>
                <Text style={styles.label}>{p.name}</Text>
                <Text style={styles.value}>{labelForScheme(p.scheme)}</Text>
              </Card>
            ))
          )}
          <Pressable
            style={[styles.btn, styles.btnGhost, { marginTop: theme.spacing.sm }]}
            onPress={() => router.push('/projects/new')}
          >
            <Text style={styles.btnGhostText}>+ New project</Text>
          </Pressable>
        </Section>

        <Section title="AI">
          <Card>
            <Text style={styles.label}>Anthropic API key</Text>
            <Text style={styles.value}>
              {claudeConfigured()
                ? 'Configured via .env'
                : 'Not configured — receipt extraction is disabled.'}
            </Text>
          </Card>
        </Section>

        <Section title="Debug">
          <Card>
            <Text style={styles.label}>Redirect URI for Google OAuth</Text>
            <Text style={styles.mono}>{redirectUri}</Text>
            <Text style={styles.hint}>
              Add this URL to your Google Cloud OAuth client's authorized
              redirect URIs.
            </Text>
          </Card>
        </Section>

        <View style={{ height: theme.spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
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
  label: { ...theme.type.label, color: theme.colors.textMuted, marginBottom: 4 },
  value: { ...theme.type.body, color: theme.colors.text },
  iteration: {
    ...theme.type.display,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
  mono: { ...theme.type.mono, color: theme.colors.text, marginTop: 4 },
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
});
