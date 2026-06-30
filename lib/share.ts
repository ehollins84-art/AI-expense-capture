// Client for the shared-projects backend (workers/extract/src/shares.ts).
//
// A shared project lets two people add expenses to the same project and see the
// combined total. The data lives on the server (not in the personal Drive
// backup), keyed by share id. Identity is the user's Google account — we send
// their Google access token with every call and the server verifies it.
//
// Shared expenses are metadata-only (title, date, category, amount): receipt
// *photos* stay on whoever captured them and are not uploaded. That keeps the
// shared ledger small and cheap while still giving both people every line item
// and the running total.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getValidToken, getStoredEmail } from './drive';
import type { Expense, Project } from './types';

const BASE = (process.env.EXPO_PUBLIC_EXTRACT_URL ?? '').trim().replace(/\/$/, '');
const APP_TOKEN = (process.env.EXPO_PUBLIC_APP_TOKEN ?? '').trim();
const CACHE_KEY = 'share.cache.v1';

// --- Wire shapes (mirror the server) ------------------------------------------

export type SharedExpense = {
  id: string;
  title: string;
  date: string;
  category: string;
  amount: number;
  currency: string;
  notes?: string;
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
    createdAt: e.createdAt,
    shareId: sp.id,
    addedByEmail: e.addedByEmail,
  }));
}
