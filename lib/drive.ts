import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import type { Expense } from './types';

const BASE_FOLDER_NAME = 'Schedule E AI';
const TOKEN_KEY = 'drive.token';
const EMAIL_KEY = 'drive.email';
const ITERATION_KEY = 'drive.iteration';
const FOLDER_CACHE_KEY = 'drive.folderCache';

type FolderCache = Record<string, string>; // path -> file id

async function readFolderCache(): Promise<FolderCache> {
  const raw = await AsyncStorage.getItem(FOLDER_CACHE_KEY);
  return raw ? (JSON.parse(raw) as FolderCache) : {};
}

async function writeFolderCache(cache: FolderCache): Promise<void> {
  await AsyncStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(cache));
}

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
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

export async function saveAuth(token: string, email?: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  if (email) await AsyncStorage.setItem(EMAIL_KEY, email);
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.multiRemove([
    TOKEN_KEY,
    EMAIL_KEY,
    ITERATION_KEY,
    FOLDER_CACHE_KEY,
  ]);
}

async function driveFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const resp = await fetch(`https://www.googleapis.com/${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  return resp;
}

async function findOrCreateFolder(
  token: string,
  name: string,
  parentId?: string,
  cache?: FolderCache,
  cacheKey?: string,
): Promise<string> {
  if (cache && cacheKey && cache[cacheKey]) return cache[cacheKey];

  const parentClause = parentId
    ? `'${parentId}' in parents`
    : `'root' in parents`;
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentClause}`,
  );
  const listResp = await driveFetch(
    token,
    `drive/v3/files?q=${q}&fields=files(id,name)`,
  );
  if (!listResp.ok) {
    throw new Error(`Drive list failed: ${listResp.status}`);
  }
  const listJson = (await listResp.json()) as {
    files: Array<{ id: string; name: string }>;
  };
  if (listJson.files.length > 0) {
    const id = listJson.files[0].id;
    if (cache && cacheKey) {
      cache[cacheKey] = id;
      await writeFolderCache(cache);
    }
    return id;
  }
  const createResp = await driveFetch(token, 'drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });
  if (!createResp.ok) {
    throw new Error(`Drive create folder failed: ${createResp.status}`);
  }
  const created = (await createResp.json()) as { id: string };
  if (cache && cacheKey) {
    cache[cacheKey] = created.id;
    await writeFolderCache(cache);
  }
  return created.id;
}

export async function listRemoteIterations(token: string): Promise<string[]> {
  const baseId = await findOrCreateFolder(token, BASE_FOLDER_NAME);
  const q = encodeURIComponent(
    `'${baseId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const resp = await driveFetch(
    token,
    `drive/v3/files?q=${q}&fields=files(id,name)`,
  );
  if (!resp.ok) return [];
  const json = (await resp.json()) as {
    files: Array<{ id: string; name: string }>;
  };
  return json.files
    .map((f) => f.name)
    .filter((n) => /^[A-Z]$/.test(n))
    .sort();
}

async function uploadFile(
  token: string,
  parentId: string,
  name: string,
  mediaType: string,
  body: string | Uint8Array,
  isBase64 = false,
): Promise<void> {
  const boundary = `boundary_${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, parents: [parentId] });

  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mediaType}\r\n${isBase64 ? 'Content-Transfer-Encoding: base64\r\n' : ''}\r\n`;
  const tail = `\r\n--${boundary}--`;

  const bodyStr = typeof body === 'string' ? body : '';
  const multipartBody = head + bodyStr + tail;

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
    throw new Error(`Drive upload failed: ${resp.status} ${txt.slice(0, 200)}`);
  }
}

export async function uploadExpenseToDrive(
  token: string,
  iteration: string,
  projectName: string,
  expense: Expense,
  imageUri: string,
): Promise<void> {
  const cache = await readFolderCache();
  const baseId = await findOrCreateFolder(
    token,
    BASE_FOLDER_NAME,
    undefined,
    cache,
    `base`,
  );
  const iterId = await findOrCreateFolder(
    token,
    iteration,
    baseId,
    cache,
    `base/${iteration}`,
  );
  const projId = await findOrCreateFolder(
    token,
    projectName,
    iterId,
    cache,
    `base/${iteration}/${projectName}`,
  );
  const year = new Date(expense.date).getFullYear().toString();
  const yearId = await findOrCreateFolder(
    token,
    year,
    projId,
    cache,
    `base/${iteration}/${projectName}/${year}`,
  );
  const folderName = `${expense.date.replaceAll('-', '.')} ${expense.title.replace(/[/\\:*?"<>|]/g, '').trim()}`;
  const expenseFolderId = await findOrCreateFolder(
    token,
    folderName,
    yearId,
    cache,
    `base/${iteration}/${projectName}/${year}/${folderName}`,
  );

  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mediaType = imageUri.toLowerCase().endsWith('.png')
    ? 'image/png'
    : 'image/jpeg';
  await uploadFile(
    token,
    expenseFolderId,
    expense.imageFilename,
    mediaType,
    base64,
    true,
  );

  const metaText = [
    `Title: ${expense.title}`,
    `Date: ${expense.date}`,
    `Category: ${expense.category}`,
    `Amount: ${expense.currency} ${expense.amount.toFixed(2)}`,
    expense.notes ? `Notes: ${expense.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  await uploadFile(
    token,
    expenseFolderId,
    'metadata.txt',
    'text/plain',
    metaText,
  );
  await uploadFile(
    token,
    expenseFolderId,
    'metadata.json',
    'application/json',
    JSON.stringify(expense, null, 2),
  );
}

export async function fetchUserEmail(token: string): Promise<string | null> {
  try {
    const resp = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}
