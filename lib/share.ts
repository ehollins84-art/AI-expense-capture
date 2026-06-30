// Client for the shared-projects backend (workers/extract/src/shares.ts).
//
// A shared project lets two people add expenses to the same project and see the
// combined total. The data lives on the server (not in the personal Drive
// backup), keyed by share id. Identity is the user's Google account — we send
// their Google access token with every call and the server verifies it.
//
// Expense details (title, date, category, amount) sync through D1; receipt
// photos sync through R2 (uploaded on capture, downloaded + cached on demand by
// the other person's phone), so everyone sees the same receipts and total.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getValidToken, getStoredEmail } from './drive';
import { ensureDir } from './storage';
import type { Expense, Project } from './types';

const BASE = (process.env.EXPO_PUBLIC_EXTRACT_URL ?? '').trim().replace(/\/$/, '');
const APP_TOKEN = (process.env.EXPO_PUBLIC_APP_TOKEN ?? '').trim();
const CACHE_KEY = 'share.cache.v1';
// Downloaded shared receipt photos are cached here so they only download once.
const SHARED_IMG_DIR = FileSystem.documentDirectory + 'manila-shared/';

// --- Wire shapes (mirror the server) ------------------------------------------

export type SharedExpense = {
  id: string;
  title: string;
  date: string;
  category: string;
  amount: number;
  currency: string;
  notes?: string;
  imageFilename?: string;
  addedByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type SharedProject = {
  id: string;
  name: string;
  scheme: string;
  categories: string[];
  ownerEmail: string;
  members: string[];
  createdAt: string;
  expenses: SharedExpense[];
};

// --- Errors -------------------------------------------------------------------

export class ShareNotConfiguredError extends Error {
  constructor() {
    super('Sharing backend is not set up for this build.');
  }
}

export class ShareNotConnectedError extends Error {
  constructor() {
    super('Connect Google in Settings to share projects.');
  }
}

export function shareConfigured(): boolean {
  return Boolean(BASE && APP_TOKEN);
}

// --- Transport ----------------------------------------------------------------

async function api<T>(action: string, body: unknown): Promise<T> {
  if (!shareConfigured()) throw new ShareNotConfiguredError();
  const token = await getValidToken();
  if (!token) throw new ShareNotConnectedError();

  const resp = await fetch(`${BASE}/shares/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-token': APP_TOKEN,
      'x-google-token': token,
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!resp.ok) {
    const text = (await resp.text().catch(() => '')).trim();
    throw new Error(text || `Sharing request failed (${resp.status}).`);
  }
  return (await resp.json()) as T;
}

// --- API ----------------------------------------------------------------------

export async function createShare(input: {
  id?: string;
  name: string;
  scheme: string;
  categories: string[];
}): Promise<SharedProject> {
  const { share } = await api<{ share: SharedProject }>('create', input);
  return share;
}

export async function inviteMember(
  shareId: string,
  email: string,
): Promise<SharedProject> {
  const { share } = await api<{ share: SharedProject }>('invite', {
    shareId,
    email,
  });
  return share;
}

export async function pullShares(): Promise<SharedProject[]> {
  const { shares } = await api<{ shares: SharedProject[] }>('pull', {});
  return shares ?? [];
}

export async function pushExpense(
  shareId: string,
  expense: {
    id?: string;
    title: string;
    date: string;
    category: string;
    amount: number;
    currency: string;
    notes?: string;
    imageFilename?: string;
    createdAt?: string;
    deleted?: boolean;
  },
): Promise<SharedExpense | null> {
  const { expense: saved } = await api<{ expense: SharedExpense | null }>(
    'push',
    { shareId, expense },
  );
  return saved;
}

export async function leaveShare(shareId: string): Promise<void> {
  await api<{ ok: boolean }>('leave', { shareId });
}

// --- Receipt photos -----------------------------------------------------------

const IMG_EXTS = ['jpg', 'jpeg', 'png', 'heic', 'webp'];

export function shareImageFilename(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  return `receipt.${IMG_EXTS.includes(ext) ? ext : 'jpg'}`;
}

function mediaTypeForUri(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

function sharedImageCachePath(
  shareId: string,
  expenseId: string,
  filename: string,
): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  return `${SHARED_IMG_DIR}${shareId}/${expenseId}.${ext}`;
}

// Upload a receipt photo for a shared expense to the backend (R2), then copy it
// into the local cache so this device shows it instantly without re-downloading.
export async function putShareImage(
  shareId: string,
  expenseId: string,
  localUri: string,
  filename: string,
): Promise<void> {
  const dataBase64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await api('image-put', {
    shareId,
    expenseId,
    filename,
    mediaType: mediaTypeForUri(localUri),
    dataBase64,
  });
  const dest = sharedImageCachePath(shareId, expenseId, filename);
  try {
    await ensureDir(`${SHARED_IMG_DIR}${shareId}/`);
    await FileSystem.copyAsync({ from: localUri, to: dest });
  } catch {
    // Cache copy is best-effort; the image can always be re-downloaded.
  }
}

// Resolve a local file path for a shared expense's photo, downloading it from
// the backend on first access and caching it. Returns null if there's no photo.
export async function ensureSharedImage(
  shareId: string,
  expenseId: string,
  filename: string | undefined,
): Promise<string | null> {
  if (!filename) return null;
  const dest = sharedImageCachePath(shareId, expenseId, filename);
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return dest;
  if (!shareConfigured()) return null;
  try {
    const { dataBase64 } = await api<{
      dataBase64: string | null;
      mediaType?: string;
    }>('image-get', { shareId, expenseId });
    if (!dataBase64) return null;
    await ensureDir(`${SHARED_IMG_DIR}${shareId}/`);
    await FileSystem.writeAsStringAsync(dest, dataBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return dest;
  } catch (e) {
    console.warn('Shared image download failed:', e);
    return null;
  }
}

// --- Local cache (so shared projects render offline / before first pull) ------

export async function readShareCache(): Promise<SharedProject[]> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SharedProject[]) : [];
  } catch {
    return [];
  }
}

export async function writeShareCache(shares: SharedProject[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(shares));
}

export async function myEmail(): Promise<string | null> {
  const email = await getStoredEmail();
  return email ? email.toLowerCase() : null;
}

// --- Mapping to the app's Project / Expense shapes ----------------------------

// A shared project is presented to the rest of the app as a normal `custom`
// project whose category list is the synced one, tagged with `shareId` so the
// store can route its mutations to the backend.
export function sharedToProject(sp: SharedProject): Project {
  return {
    id: sp.id,
    name: sp.name,
    scheme: 'custom',
    customCategories: sp.categories,
    createdAt: sp.createdAt,
    shareId: sp.id,
    ownerEmail: sp.ownerEmail,
    members: sp.members,
  };
}

export function sharedToExpenses(sp: SharedProject): Expense[] {
  return sp.expenses.map((e) => ({
    id: e.id,
    projectId: sp.id,
    title: e.title,
    date: e.date,
    category: e.category,
    amount: e.amount,
    currency: e.currency,
    notes: e.notes,
    imageFilename: e.imageFilename,
    createdAt: e.createdAt,
    shareId: sp.id,
    addedByEmail: e.addedByEmail,
  }));
}
