import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import type { Expense, Project } from './types';
import {
  expenseFolderPath,
  ensureDir,
  importExpenseFromMetadata,
  upsertImportedProject,
  iterationRootPath,
} from './storage';

export const SCHEMA_VERSION = 1;
export const BASE_FOLDER_NAME = 'Manila';
const MANIFEST_FILENAME = '_manifest.json';
const PROJECT_FILENAME = 'project.json';
const CONCURRENT_DEVICE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const AUTH_KEY = 'drive.auth';
const EMAIL_KEY = 'drive.email';
const ITERATION_KEY = 'drive.iteration';
const FOLDER_CACHE_KEY = 'drive.folderCache';
const DEVICE_ID_KEY = 'device.id';

const GOOGLE_CLIENT_ID =
  (Constants.expoConfig?.extra?.googleIosClientId as string | undefined) ??
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ??
  '';

type StoredAuth = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
};

type FolderCache = Record<string, string>;

// --- Device identity ----------------------------------------------------------

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// --- Auth storage -------------------------------------------------------------

async function readAuth(): Promise<StoredAuth | null> {
  const raw = await AsyncStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.accessToken !== 'string') return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken ?? null,
      expiresAt: parsed.expiresAt ?? 0,
    };
  } catch {
    return null;
  }
}

async function writeAuth(auth: StoredAuth): Promise<void> {
  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export async function saveAuth(
  auth: {
    accessToken: string;
    refreshToken: string | null;
    expiresInSeconds: number;
  },
  email?: string,
): Promise<void> {
  await writeAuth({
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: Date.now() + auth.expiresInSeconds * 1000,
  });
  if (email) await AsyncStorage.setItem(EMAIL_KEY, email);
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.multiRemove([
    AUTH_KEY,
    EMAIL_KEY,
    ITERATION_KEY,
    FOLDER_CACHE_KEY,
  ]);
}

export async function getStoredEmail(): Promise<string | null> {
  return AsyncStorage.getItem(EMAIL_KEY);
}

export async function getStoredIteration(): Promise<string | null> {
  return AsyncStorage.getItem(ITERATION_KEY);
}

export async function setStoredIteration(letter: string): Promise<void> {
  await AsyncStorage.setItem(ITERATION_KEY, letter);
}

export async function isConnected(): Promise<boolean> {
  return (await readAuth()) !== null;
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresInSeconds: number;
}> {
  if (!GOOGLE_CLIENT_ID) throw new Error('No Google client ID configured');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!resp.ok) {
    throw new Error(`Token refresh failed: ${resp.status} ${await resp.text()}`);
  }
  const json = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    expiresInSeconds: json.expires_in,
  };
}

/**
 * Returns a valid Drive access token, refreshing if needed.
 * Returns null when no auth is stored or refresh has failed (in which case the
 * stored auth is cleared and the caller should prompt re-connect).
 */
export async function getValidToken(): Promise<string | null> {
  const auth = await readAuth();
  if (!auth) return null;
  if (auth.expiresAt - Date.now() > 60_000) return auth.accessToken;
  if (!auth.refreshToken) {
    await clearAuth();
    return null;
  }
  try {
    const refreshed = await refreshAccessToken(auth.refreshToken);
    await writeAuth({
      ...auth,
      accessToken: refreshed.accessToken,
      expiresAt: Date.now() + refreshed.expiresInSeconds * 1000,
    });
    return refreshed.accessToken;
  } catch (e) {
    console.warn('Drive token refresh failed; clearing auth:', e);
    await clearAuth();
    return null;
  }
}

// --- Folder cache -------------------------------------------------------------

async function readFolderCache(): Promise<FolderCache> {
  const raw = await AsyncStorage.getItem(FOLDER_CACHE_KEY);
  return raw ? (JSON.parse(raw) as FolderCache) : {};
}

async function writeFolderCache(cache: FolderCache): Promise<void> {
  await AsyncStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(cache));
}

// --- Drive primitives ---------------------------------------------------------

async function driveFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://www.googleapis.com/${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function escapeDriveQuery(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFolderId(
  token: string,
  name: string,
  parentId: string,
): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${escapeDriveQuery(name)}' and mimeType='${FOLDER_MIME}' and trashed=false and '${parentId}' in parents`,
  );
  const resp = await driveFetch(token, `drive/v3/files?q=${q}&fields=files(id)`);
  if (!resp.ok) return null;
  const json = (await resp.json()) as { files: Array<{ id: string }> };
  return json.files[0]?.id ?? null;
}

async function findFileId(
  token: string,
  name: string,
  parentId: string,
): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${escapeDriveQuery(name)}' and mimeType!='${FOLDER_MIME}' and trashed=false and '${parentId}' in parents`,
  );
  const resp = await driveFetch(token, `drive/v3/files?q=${q}&fields=files(id)`);
  if (!resp.ok) return null;
  const json = (await resp.json()) as { files: Array<{ id: string }> };
  return json.files[0]?.id ?? null;
}

async function listSubfolders(
  token: string,
  parentId: string,
): Promise<Array<{ id: string; name: string }>> {
  const out: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;
  do {
    const q = encodeURIComponent(
      `mimeType='${FOLDER_MIME}' and trashed=false and '${parentId}' in parents`,
    );
    const url =
      `drive/v3/files?q=${q}&fields=files(id,name),nextPageToken&pageSize=200` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const resp = await driveFetch(token, url);
    if (!resp.ok) break;
    const json = (await resp.json()) as {
      files: Array<{ id: string; name: string }>;
      nextPageToken?: string;
    };
    out.push(...json.files);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

async function findOrCreateFolder(
  token: string,
  name: string,
  parentId: string,
  cache: FolderCache,
  cacheKey: string,
): Promise<string> {
  if (cache[cacheKey]) return cache[cacheKey];
  const existing = await findFolderId(token, name, parentId);
  if (existing) {
    cache[cacheKey] = existing;
    await writeFolderCache(cache);
    return existing;
  }
  const createResp = await driveFetch(token, 'drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!createResp.ok) {
    throw new Error(`Drive create folder failed: ${createResp.status}`);
  }
  const created = (await createResp.json()) as { id: string };
  cache[cacheKey] = created.id;
  await writeFolderCache(cache);
  return created.id;
}

async function uploadFile(
  token: string,
  parentId: string,
  name: string,
  mediaType: string,
  body: string,
  isBase64 = false,
): Promise<void> {
  const boundary = `boundary_${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, parents: [parentId] });
  const head =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}` +
    `\r\n--${boundary}\r\nContent-Type: ${mediaType}\r\n` +
    (isBase64 ? 'Content-Transfer-Encoding: base64\r\n' : '') +
    `\r\n`;
  const tail = `\r\n--${boundary}--`;
  const multipartBody = head + body + tail;
  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    },
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(
      `Drive upload failed for ${name}: ${resp.status} ${txt.slice(0, 200)}`,
    );
  }
}

async function deleteFileByName(
  token: string,
  parentId: string,
  name: string,
): Promise<void> {
  const id = await findFileId(token, name, parentId);
  if (id) {
    await driveFetch(token, `drive/v3/files/${id}`, { method: 'DELETE' });
  }
}

async function writeJson(
  token: string,
  parentId: string,
  name: string,
  data: unknown,
): Promise<void> {
  await deleteFileByName(token, parentId, name);
  await uploadFile(
    token,
    parentId,
    name,
    'application/json',
    JSON.stringify(data, null, 2),
  );
}

async function downloadFileText(
  token: string,
  fileId: string,
): Promise<string> {
  const resp = await driveFetch(token, `drive/v3/files/${fileId}?alt=media`);
  if (!resp.ok) throw new Error(`Drive download failed: ${resp.status}`);
  return resp.text();
}

async function downloadFileToPath(
  token: string,
  fileId: string,
  localPath: string,
): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const result = await FileSystem.downloadAsync(url, localPath, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.status >= 400) {
    throw new Error(`Drive download failed: ${result.status}`);
  }
}

// --- Path helpers (mirror storage.ts) -----------------------------------------

function expenseFolderName(expense: Expense): string {
  const dateStr = expense.date.replaceAll('-', '.');
  const safeTitle = expense.title.replace(/[/\\:*?"<>|]/g, '').trim();
  return `${dateStr} ${safeTitle}`;
}

function imageMediaType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
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

function metadataText(expense: Expense): string {
  return [
    `Title: ${expense.title}`,
    `Date: ${expense.date}`,
    `Category: ${expense.category}`,
    `Amount: ${expense.currency} ${expense.amount.toFixed(2)}`,
    expense.notes ? `Notes: ${expense.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// --- Iteration manifest -------------------------------------------------------

type IterationManifest = {
  deviceId: string;
  lastWriteAt: string;
  schemaVersion: number;
};

async function readIterationManifest(
  token: string,
  iteration: string,
): Promise<IterationManifest | null> {
  const baseId = await findFolderId(token, BASE_FOLDER_NAME, 'root');
  if (!baseId) return null;
  const iterId = await findFolderId(token, iteration, baseId);
  if (!iterId) return null;
  const fileId = await findFileId(token, MANIFEST_FILENAME, iterId);
  if (!fileId) return null;
  try {
    return JSON.parse(await downloadFileText(token, fileId)) as IterationManifest;
  } catch {
    return null;
  }
}

async function bumpManifest(
  token: string,
  iterFolderId: string,
): Promise<void> {
  const deviceId = await getDeviceId();
  await writeJson(token, iterFolderId, MANIFEST_FILENAME, {
    deviceId,
    lastWriteAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  } satisfies IterationManifest);
}

// --- Resolve iteration scaffolding -------------------------------------------

async function resolveIterationFolders(
  token: string,
  iteration: string,
  cache: FolderCache,
): Promise<{ baseId: string; iterId: string }> {
  const baseId = await findOrCreateFolder(
    token,
    BASE_FOLDER_NAME,
    'root',
    cache,
    'base',
  );
  const iterId = await findOrCreateFolder(
    token,
    iteration,
    baseId,
    cache,
    `base/${iteration}`,
  );
  return { baseId, iterId };
}

async function resolveProjectFolder(
  token: string,
  iteration: string,
  projectName: string,
  cache: FolderCache,
): Promise<{ iterId: string; projId: string }> {
  const { iterId } = await resolveIterationFolders(token, iteration, cache);
  const projId = await findOrCreateFolder(
    token,
    projectName,
    iterId,
    cache,
    `base/${iteration}/${projectName}`,
  );
  return { iterId, projId };
}

// --- High-level writers -------------------------------------------------------

/**
 * Write the project's manifest to its Drive folder. Creates the folder if needed.
 * Idempotent: overwrites any existing project.json.
 */
export async function uploadProjectManifest(
  iteration: string,
  project: Project,
): Promise<void> {
  const token = await getValidToken();
  if (!token) return;
  const cache = await readFolderCache();
  const { iterId, projId } = await resolveProjectFolder(
    token,
    iteration,
    project.name,
    cache,
  );
  await writeJson(token, projId, PROJECT_FILENAME, {
    ...project,
    schemaVersion: SCHEMA_VERSION,
  });
  await bumpManifest(token, iterId);
}

/**
 * Idempotent upload of an expense: image goes up only if missing, metadata is
 * always rewritten so it acts as the per-expense write checkpoint.
 */
export async function uploadExpenseToDrive(
  iteration: string,
  project: Project,
  expense: Expense,
  imageUri: string | null,
): Promise<void> {
  const token = await getValidToken();
  if (!token) return;
  const cache = await readFolderCache();
  const { iterId, projId } = await resolveProjectFolder(
    token,
    iteration,
    project.name,
    cache,
  );

  // Lazy backfill of project.json if missing.
  const pjId = await findFileId(token, PROJECT_FILENAME, projId);
  if (!pjId) {
    await writeJson(token, projId, PROJECT_FILENAME, {
      ...project,
      schemaVersion: SCHEMA_VERSION,
    });
  }

  const year = new Date(expense.date).getFullYear().toString();
  const yearId = await findOrCreateFolder(
    token,
    year,
    projId,
    cache,
    `base/${iteration}/${project.name}/${year}`,
  );
  const folderName = expenseFolderName(expense);
  const expenseFolderId = await findOrCreateFolder(
    token,
    folderName,
    yearId,
    cache,
    `base/${iteration}/${project.name}/${year}/${folderName}`,
  );

  // Upload image only if one exists and isn't already on Drive.
  if (expense.imageFilename && imageUri) {
    const existingImageId = await findFileId(
      token,
      expense.imageFilename,
      expenseFolderId,
    );
    if (!existingImageId) {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await uploadFile(
        token,
        expenseFolderId,
        expense.imageFilename,
        imageMediaType(expense.imageFilename),
        base64,
        true,
      );
    }
  }

  await writeJson(token, expenseFolderId, 'metadata.json', {
    ...expense,
    schemaVersion: SCHEMA_VERSION,
  });
  await deleteFileByName(token, expenseFolderId, 'metadata.txt');
  await uploadFile(
    token,
    expenseFolderId,
    'metadata.txt',
    'text/plain',
    metadataText(expense),
  );

  await bumpManifest(token, iterId);
}

/**
 * Upsert-and-cleanup for edits: upload to the new path, then delete the old
 * expense folder on Drive if its name or year changed.
 */
export async function syncExpenseEdit(
  iteration: string,
  project: Project,
  oldExpense: Expense,
  newExpense: Expense,
  imageUri: string | null,
): Promise<void> {
  const oldFolderName = expenseFolderName(oldExpense);
  const newFolderName = expenseFolderName(newExpense);
  const oldYear = new Date(oldExpense.date).getFullYear().toString();
  const newYear = new Date(newExpense.date).getFullYear().toString();

  await uploadExpenseToDrive(iteration, project, newExpense, imageUri);

  if (oldFolderName === newFolderName && oldYear === newYear) return;

  const token = await getValidToken();
  if (!token) return;
  const baseId = await findFolderId(token, BASE_FOLDER_NAME, 'root');
  if (!baseId) return;
  const iterId = await findFolderId(token, iteration, baseId);
  if (!iterId) return;
  const projId = await findFolderId(token, project.name, iterId);
  if (!projId) return;
  const oldYearId = await findFolderId(token, oldYear, projId);
  if (!oldYearId) return;
  const oldFolderId = await findFolderId(token, oldFolderName, oldYearId);
  if (!oldFolderId) return;

  await driveFetch(token, `drive/v3/files/${oldFolderId}`, { method: 'DELETE' });

  const cache = await readFolderCache();
  delete cache[`base/${iteration}/${project.name}/${oldYear}/${oldFolderName}`];
  await writeFolderCache(cache);
}

export async function deleteExpenseFromDrive(
  iteration: string,
  project: Project,
  expense: Expense,
): Promise<void> {
  const token = await getValidToken();
  if (!token) return;
  const baseId = await findFolderId(token, BASE_FOLDER_NAME, 'root');
  if (!baseId) return;
  const iterId = await findFolderId(token, iteration, baseId);
  if (!iterId) return;
  const projId = await findFolderId(token, project.name, iterId);
  if (!projId) return;
  const year = new Date(expense.date).getFullYear().toString();
  const yearId = await findFolderId(token, year, projId);
  if (!yearId) return;
  const folderName = expenseFolderName(expense);
  const folderId = await findFolderId(token, folderName, yearId);
  if (folderId) {
    await driveFetch(token, `drive/v3/files/${folderId}`, { method: 'DELETE' });
  }
  await bumpManifest(token, iterId);
  const cache = await readFolderCache();
  delete cache[`base/${iteration}/${project.name}/${year}/${folderName}`];
  await writeFolderCache(cache);
}

// --- Listing ------------------------------------------------------------------

export async function listRemoteIterations(): Promise<string[]> {
  const token = await getValidToken();
  if (!token) return [];
  const baseId = await findFolderId(token, BASE_FOLDER_NAME, 'root');
  if (!baseId) return [];
  const folders = await listSubfolders(token, baseId);
  return folders
    .map((f) => f.name)
    .filter((n) => /^[A-Z]$/.test(n))
    .sort();
}

// --- Concurrent-device check -------------------------------------------------

export type ConcurrentDeviceWarning = {
  otherDeviceId: string;
  lastWriteAt: string;
  ageMs: number;
};

export async function checkConcurrentDevice(
  iteration: string,
): Promise<ConcurrentDeviceWarning | null> {
  const token = await getValidToken();
  if (!token) return null;
  const manifest = await readIterationManifest(token, iteration);
  if (!manifest) return null;
  const ourId = await getDeviceId();
  if (manifest.deviceId === ourId) return null;
  const lastWrite = new Date(manifest.lastWriteAt).getTime();
  if (Number.isNaN(lastWrite)) return null;
  const ageMs = Date.now() - lastWrite;
  if (ageMs > CONCURRENT_DEVICE_GRACE_MS) return null;
  return { otherDeviceId: manifest.deviceId, lastWriteAt: manifest.lastWriteAt, ageMs };
}

// --- User info ----------------------------------------------------------------

export async function fetchUserEmail(token: string): Promise<string | null> {
  try {
    const resp = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

// --- Import -------------------------------------------------------------------

export type ImportProgress = {
  phase: 'discovering' | 'projects' | 'expenses' | 'done';
  current: number;
  total: number;
  message: string;
};

export type ImportResult = {
  projects: Project[];
  expenses: Expense[];
  skipped: number;
  lossy: string[];
};

/**
 * Pull a Drive iteration into the local filesystem. Idempotent: anything
 * already present locally (by id) is skipped. Image download writes to the
 * final path; metadata.json is written last as the resumption checkpoint.
 */
export async function importIteration(
  iteration: string,
  existingProjectIds: Set<string>,
  existingExpenseIds: Set<string>,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const token = await getValidToken();
  if (!token) throw new Error('Not connected to Drive');

  onProgress({
    phase: 'discovering',
    current: 0,
    total: 0,
    message: 'Scanning Drive…',
  });
  const baseId = await findFolderId(token, BASE_FOLDER_NAME, 'root');
  if (!baseId) {
    return { projects: [], expenses: [], skipped: 0, lossy: [] };
  }
  const iterId = await findFolderId(token, iteration, baseId);
  if (!iterId) {
    return { projects: [], expenses: [], skipped: 0, lossy: [] };
  }

  await ensureDir(iterationRootPath(iteration));

  const projectFolders = await listSubfolders(token, iterId);
  const importedProjects: Project[] = [];
  const importedExpenses: Expense[] = [];
  const lossy: string[] = [];
  let skipped = 0;

  // --- Pass 1: projects ---
  for (let i = 0; i < projectFolders.length; i++) {
    const projFolder = projectFolders[i];
    onProgress({
      phase: 'projects',
      current: i,
      total: projectFolders.length,
      message: projFolder.name,
    });

    let project: Project | null = null;
    const pjId = await findFileId(token, PROJECT_FILENAME, projFolder.id);
    if (pjId) {
      try {
        const text = await downloadFileText(token, pjId);
        const parsed = JSON.parse(text);
        if (parsed.id && parsed.name && parsed.scheme) {
          project = {
            id: parsed.id,
            name: parsed.name,
            scheme: parsed.scheme,
            customCategories: parsed.customCategories,
            createdAt: parsed.createdAt ?? new Date().toISOString(),
          };
        }
      } catch {
        // fall through to synthesis
      }
    }
    if (!project) {
      // No project.json — synthesize. We need a stable id; use the Drive
      // folder id as the deterministic source.
      project = {
        id: `synth-${projFolder.id}`,
        name: projFolder.name,
        scheme: 'custom',
        customCategories: [],
        createdAt: new Date().toISOString(),
      };
      lossy.push(`Project "${projFolder.name}" had no manifest; synthesized.`);
    }

    if (!existingProjectIds.has(project.id)) {
      await upsertImportedProject(iteration, project);
      importedProjects.push(project);
    } else {
      skipped++;
    }
  }

  // Map project folder name → resolved project (for path construction during
  // expense import).
  const projectByFolderName = new Map<string, Project>();
  for (let i = 0; i < projectFolders.length; i++) {
    const projFolder = projectFolders[i];
    const matched =
      importedProjects.find((p) => p.name === projFolder.name) ??
      (await readProjectFromDrive(token, projFolder.id, projFolder.name));
    if (matched) projectByFolderName.set(projFolder.name, matched);
  }

  // --- Pass 2: count expenses upfront for accurate progress ---
  type ExpenseTask = {
    project: Project;
    yearFolderName: string;
    expenseFolder: { id: string; name: string };
  };
  const tasks: ExpenseTask[] = [];
  for (const projFolder of projectFolders) {
    const project = projectByFolderName.get(projFolder.name);
    if (!project) continue;
    const yearFolders = await listSubfolders(token, projFolder.id);
    for (const yf of yearFolders) {
      if (!/^\d{4}$/.test(yf.name)) continue;
      const expenseFolders = await listSubfolders(token, yf.id);
      for (const ef of expenseFolders) {
        tasks.push({
          project,
          yearFolderName: yf.name,
          expenseFolder: ef,
        });
      }
    }
  }

  // --- Pass 3: download each expense ---
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    onProgress({
      phase: 'expenses',
      current: i,
      total: tasks.length,
      message: `${task.project.name} / ${task.expenseFolder.name}`,
    });

    const mjId = await findFileId(token, 'metadata.json', task.expenseFolder.id);
    if (!mjId) {
      lossy.push(`Skipped folder without metadata.json: ${task.expenseFolder.name}`);
      continue;
    }

    let expense: Expense;
    try {
      const text = await downloadFileText(token, mjId);
      const parsed = JSON.parse(text);
      expense = {
        id: parsed.id,
        projectId: parsed.projectId ?? task.project.id,
        title: parsed.title,
        date: parsed.date,
        category: parsed.category,
        amount: parsed.amount,
        currency: parsed.currency ?? 'USD',
        imageFilename: parsed.imageFilename,
        notes: parsed.notes,
        createdAt: parsed.createdAt ?? new Date().toISOString(),
      };
    } catch (e) {
      lossy.push(`Failed to parse metadata: ${task.expenseFolder.name}`);
      continue;
    }

    if (existingExpenseIds.has(expense.id)) {
      skipped++;
      continue;
    }

    // Download the image to its final local path first (skipped for manual
    // entries that never had one).
    const localFolder = expenseFolderPath(iteration, expense);
    await ensureDir(localFolder);
    if (expense.imageFilename) {
      const imageId = await findFileId(
        token,
        expense.imageFilename,
        task.expenseFolder.id,
      );
      if (imageId) {
        try {
          await downloadFileToPath(
            token,
            imageId,
            `${localFolder}${expense.imageFilename}`,
          );
        } catch (e) {
          lossy.push(`Image download failed for ${expense.title}`);
          // Continue — metadata still gets imported, image will just be missing.
        }
      }
    }

    // Write metadata last — this is the resumption checkpoint.
    await importExpenseFromMetadata(iteration, expense);
    importedExpenses.push(expense);
  }

  onProgress({
    phase: 'done',
    current: importedExpenses.length,
    total: tasks.length,
    message: 'Import complete',
  });

  return {
    projects: importedProjects,
    expenses: importedExpenses,
    skipped,
    lossy,
  };
}

async function readProjectFromDrive(
  token: string,
  folderId: string,
  fallbackName: string,
): Promise<Project | null> {
  const pjId = await findFileId(token, PROJECT_FILENAME, folderId);
  if (!pjId) {
    return {
      id: `synth-${folderId}`,
      name: fallbackName,
      scheme: 'custom',
      customCategories: [],
      createdAt: new Date().toISOString(),
    };
  }
  try {
    const text = await downloadFileText(token, pjId);
    const parsed = JSON.parse(text);
    return {
      id: parsed.id,
      name: parsed.name,
      scheme: parsed.scheme,
      customCategories: parsed.customCategories,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
