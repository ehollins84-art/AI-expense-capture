import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Expense, Project } from './types';
import {
  ensureIteration,
  listIterations,
  readExpenses,
  readProjects,
  saveExpense,
  writeProjects,
  newId,
  deleteExpense as deleteExpenseFs,
  updateExpense as updateExpenseFs,
  deleteProjectAndExpenses,
  attachImageToExpense as attachImageToExpenseFs,
  reassignCategory,
  imagePathForExpense,
} from './storage';
import {
  UNCATEGORIZED,
  isProtectedCategory,
  categoriesForProject,
  addCategoryToProject,
  renameCategoryInProject,
  deleteCategoryFromProject,
} from './categories';
import {
  getStoredIteration,
  isConnected,
  setStoredIteration,
  syncExpenseEdit,
  uploadExpenseToDrive,
  uploadProjectManifest,
  deleteExpenseFromDrive,
  importIteration as importIterationDrive,
  type ImportProgress,
  type ImportResult,
} from './drive';
import {
  shareConfigured,
  pullShares,
  createShare,
  inviteMember,
  leaveShare,
  pushExpense,
  putShareImage,
  shareImageFilename,
  readShareCache,
  writeShareCache,
  sharedToProject,
  sharedToExpenses,
  ShareNotConnectedError,
  type SharedProject,
  type SharedExpense,
} from './share';

type StoreState = {
  iteration: string;
  projects: Project[];
  expenses: Expense[];
  activeProjectId: string | null;
  loading: boolean;
};

type StoreCtx = StoreState & {
  setIteration: (letter: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  addProject: (
    name: string,
    scheme: Project['scheme'],
    customCategories?: string[],
  ) => Promise<Project>;
  updateProject: (project: Project) => Promise<Project>;
  removeProject: (project: Project) => Promise<void>;
  addProjectCategory: (project: Project, name: string) => Promise<Project>;
  renameProjectCategory: (
    project: Project,
    from: string,
    to: string,
  ) => Promise<Project>;
  deleteProjectCategory: (project: Project, name: string) => Promise<Project>;
  saveExpenseAndSync: (
    expense: Omit<Expense, 'id' | 'createdAt' | 'imageFilename'>,
    imageUri: string | null,
  ) => Promise<Expense>;
  updateExpense: (expense: Expense) => Promise<Expense>;
  moveExpense: (expense: Expense, toProjectId: string) => Promise<Expense>;
  attachImage: (expense: Expense, imageUri: string) => Promise<Expense>;
  removeExpense: (expense: Expense) => Promise<void>;
  refresh: () => Promise<void>;
  importFromDrive: (
    iter: string,
    onProgress: (p: ImportProgress) => void,
  ) => Promise<ImportResult>;
  // --- Shared projects ---
  shareProject: (project: Project, inviteeEmail: string) => Promise<Project>;
  inviteToProject: (project: Project, email: string) => Promise<Project>;
  leaveSharedProject: (project: Project) => Promise<void>;
};

const ACTIVE_PROJECT_KEY = 'activeProjectId';

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [iteration, setIterationState] = useState<string>('A');
  // Local (personal) projects/expenses, persisted to the filesystem + Drive.
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [localExpenses, setLocalExpenses] = useState<Expense[]>([]);
  // Shared projects, persisted on the backend and cached in AsyncStorage.
  const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // Shared projects are surfaced to the rest of the app as ordinary projects /
  // expenses (tagged with shareId) so every existing screen — totals, category
  // breakdown, search — works on them unchanged.
  const sharedAsProjects = useMemo(
    () => sharedProjects.map(sharedToProject),
    [sharedProjects],
  );
  const sharedAsExpenses = useMemo(
    () => sharedProjects.flatMap(sharedToExpenses),
    [sharedProjects],
  );
  const projects = useMemo(
    () => [...localProjects, ...sharedAsProjects],
    [localProjects, sharedAsProjects],
  );
  const expenses = useMemo(
    () => [...localExpenses, ...sharedAsExpenses],
    [localExpenses, sharedAsExpenses],
  );

  const loadForIteration = useCallback(async (letter: string) => {
    await ensureIteration(letter);
    const [p, e] = await Promise.all([readProjects(letter), readExpenses(letter)]);
    setLocalProjects(p);
    setLocalExpenses(e);
    return { projects: p, expenses: e };
  }, []);

  // Pull shared projects from the backend, falling back to the on-device cache
  // when offline or not signed in. Best-effort: never throws to callers.
  const loadShared = useCallback(async () => {
    const cached = await readShareCache();
    setSharedProjects(cached);
    if (!shareConfigured()) return;
    try {
      const fresh = await pullShares();
      setSharedProjects(fresh);
      await writeShareCache(fresh);
    } catch (e) {
      // Not signed into Google, or offline — keep showing the cache.
      if (!(e instanceof ShareNotConnectedError)) {
        console.warn('Shared projects pull failed:', e);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cloudIter = await getStoredIteration();
        const all = await listIterations();
        const start = cloudIter ?? all[0] ?? 'A';
        setIterationState(start);
        await loadForIteration(start);
        await loadShared();

        const ap = await AsyncStorage.getItem(ACTIVE_PROJECT_KEY);
        if (ap) setActiveProjectIdState(ap);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadForIteration, loadShared]);

  const refresh = useCallback(async () => {
    await loadForIteration(iteration);
    await loadShared();
  }, [iteration, loadForIteration, loadShared]);

  const setIteration = useCallback(
    async (letter: string) => {
      setIterationState(letter);
      await setStoredIteration(letter);
      await loadForIteration(letter);
    },
    [loadForIteration],
  );

  const setActiveProject = useCallback((id: string | null) => {
    setActiveProjectIdState(id);
    if (id) AsyncStorage.setItem(ACTIVE_PROJECT_KEY, id);
    else AsyncStorage.removeItem(ACTIVE_PROJECT_KEY);
  }, []);

  // Look up a shared project (raw backend record) by its share id.
  const findShared = useCallback(
    (projectId: string | undefined | null) =>
      projectId ? sharedProjects.find((sp) => sp.id === projectId) : undefined,
    [sharedProjects],
  );

  // Merge a single saved/removed shared expense into in-memory state + cache,
  // so the UI updates without waiting for a full re-pull.
  const applySharedExpense = useCallback(
    (shareId: string, expense: SharedExpense | null, removedId?: string) => {
      setSharedProjects((prev) => {
        const next = prev.map((sp) => {
          if (sp.id !== shareId) return sp;
          let list = sp.expenses;
          if (removedId) {
            list = list.filter((e) => e.id !== removedId);
          } else if (expense) {
            list = list.some((e) => e.id === expense.id)
              ? list.map((e) => (e.id === expense.id ? expense : e))
              : [...list, expense];
          }
          return { ...sp, expenses: list };
        });
        writeShareCache(next).catch(() => {});
        return next;
      });
    },
    [],
  );

  const addProject = useCallback(
    async (
      name: string,
      scheme: Project['scheme'],
      customCategories?: string[],
    ): Promise<Project> => {
      const trimmed = name.trim();
      if (projects.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(
          `A project named "${trimmed}" already exists in iteration ${iteration}.`,
        );
      }
      const project: Project = {
        id: newId(),
        name: trimmed,
        scheme,
        customCategories: scheme === 'custom' ? customCategories : undefined,
        createdAt: new Date().toISOString(),
      };
      const next = [...localProjects, project];
      await writeProjects(iteration, next);
      setLocalProjects(next);
      setActiveProject(project.id);

      if (await isConnected()) {
        uploadProjectManifest(iteration, project).catch((err) =>
          console.warn('Project manifest upload failed:', err),
        );
      }
      return project;
    },
    [projects, localProjects, iteration, setActiveProject],
  );

  const updateProject = useCallback(
    async (next: Project): Promise<Project> => {
      // Shared projects aren't editable through this path (their name and
      // categories live on the backend); guard so callers fail clearly.
      if (next.shareId) {
        throw new Error('Shared projects can\'t be edited here yet.');
      }
      const trimmedName = next.name.trim();
      if (!trimmedName) {
        throw new Error('Project name can\'t be empty.');
      }
      const clash = projects.find(
        (p) =>
          p.id !== next.id &&
          p.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (clash) {
        throw new Error(`Another project is already named "${trimmedName}".`);
      }
      const updated: Project = { ...next, name: trimmedName };
      const list = localProjects.map((p) => (p.id === updated.id ? updated : p));
      await writeProjects(iteration, list);
      setLocalProjects(list);

      if (await isConnected()) {
        uploadProjectManifest(iteration, updated).catch((err) =>
          console.warn('Project manifest upload failed:', err),
        );
      }
      return updated;
    },
    [projects, localProjects, iteration],
  );

  const removeProject = useCallback(
    async (project: Project) => {
      if (project.shareId) {
        throw new Error('Use "Leave shared project" to remove a shared project.');
      }
      await deleteProjectAndExpenses(iteration, project.id);
      setLocalProjects((prev) => prev.filter((p) => p.id !== project.id));
      setLocalExpenses((prev) => prev.filter((e) => e.projectId !== project.id));
      if (activeProjectId === project.id) {
        setActiveProject(null);
      }
    },
    [iteration, activeProjectId, setActiveProject],
  );

  // Push a batch of category-relabelled expenses into in-memory state and,
  // when connected, sync each one to Drive in the background (best-effort).
  const applyReassigned = useCallback(
    async (project: Project, changed: Expense[], previousLabel: string) => {
      if (changed.length === 0) return;
      const byId = new Map(changed.map((e) => [e.id, e]));
      setLocalExpenses((prev) => prev.map((e) => byId.get(e.id) ?? e));
      if (await isConnected()) {
        for (const e of changed) {
          const old: Expense = { ...e, category: previousLabel };
          const imageUri = await imagePathForExpense(iteration, e);
          syncExpenseEdit(iteration, project, old, e, imageUri).catch((err) =>
            console.warn('Drive edit sync failed:', err),
          );
        }
      }
    },
    [iteration],
  );

  const addProjectCategory = useCallback(
    async (project: Project, name: string): Promise<Project> => {
      // addCategoryToProject validates (empty / duplicate / reserved name).
      const next = addCategoryToProject(project, name);
      return updateProject(next);
    },
    [updateProject],
  );

  const renameProjectCategory = useCallback(
    async (project: Project, from: string, to: string): Promise<Project> => {
      const nextProject = renameCategoryInProject(project, from, to);
      const updated = await updateProject(nextProject);
      // Move every receipt that used the old label onto the new one.
      const changed = await reassignCategory(iteration, project.id, from, to);
      await applyReassigned(updated, changed, from);
      return updated;
    },
    [updateProject, iteration, applyReassigned],
  );

  const deleteProjectCategory = useCallback(
    async (project: Project, name: string): Promise<Project> => {
      if (isProtectedCategory(name)) {
        throw new Error(`"${UNCATEGORIZED}" can't be removed.`);
      }
      // Re-home any receipts on this category before dropping it, so nothing is
      // ever orphaned.
      const changed = await reassignCategory(
        iteration,
        project.id,
        name,
        UNCATEGORIZED,
      );
      const nextProject = deleteCategoryFromProject(project, name);
      const updated = await updateProject(nextProject);
      await applyReassigned(updated, changed, name);
      return updated;
    },
    [updateProject, iteration, applyReassigned],
  );

  const saveExpenseAndSync = useCallback(
    async (
      input: Omit<Expense, 'id' | 'createdAt' | 'imageFilename'>,
      imageUri: string | null,
    ): Promise<Expense> => {
      // Shared project: the expense goes to the backend (metadata only — the
      // receipt photo stays on this phone and is not uploaded).
      const shared = findShared(input.projectId);
      if (shared) {
        const imageFilename = imageUri ? shareImageFilename(imageUri) : undefined;
        const saved = await pushExpense(shared.id, {
          title: input.title,
          date: input.date,
          category: input.category,
          amount: input.amount,
          currency: input.currency,
          notes: input.notes,
          imageFilename,
        });
        // Upload the receipt photo to the shared store (best-effort — the
        // expense is already saved even if the image upload hiccups).
        if (saved && imageUri && imageFilename) {
          try {
            await putShareImage(shared.id, saved.id, imageUri, imageFilename);
          } catch (err) {
            console.warn('Shared image upload failed:', err);
          }
        }
        if (saved) applySharedExpense(shared.id, saved);
        return {
          id: saved?.id ?? newId(),
          projectId: input.projectId,
          title: input.title,
          date: input.date,
          category: input.category,
          amount: input.amount,
          currency: input.currency,
          notes: input.notes,
          imageFilename: saved?.imageFilename ?? imageFilename,
          createdAt: saved?.createdAt ?? new Date().toISOString(),
          shareId: shared.id,
          addedByEmail: saved?.addedByEmail,
        };
      }

      const expense: Expense = {
        ...input,
        id: newId(),
        createdAt: new Date().toISOString(),
      };
      const stored = await saveExpense(iteration, expense, imageUri);
      setLocalExpenses((prev) => [...prev, stored]);

      const proj = localProjects.find((p) => p.id === stored.projectId);
      if (proj && (await isConnected())) {
        uploadExpenseToDrive(iteration, proj, stored, imageUri).catch((err) =>
          console.warn('Drive sync failed:', err),
        );
      }
      return stored;
    },
    [iteration, localProjects, findShared, applySharedExpense],
  );

  const removeExpense = useCallback(
    async (expense: Expense) => {
      if (expense.shareId) {
        // Backend enforces "only the author can delete". Soft-deletes on server.
        await pushExpense(expense.shareId, {
          id: expense.id,
          title: expense.title,
          date: expense.date,
          category: expense.category,
          amount: expense.amount,
          currency: expense.currency,
          deleted: true,
        });
        applySharedExpense(expense.shareId, null, expense.id);
        return;
      }
      await deleteExpenseFs(iteration, expense);
      setLocalExpenses((prev) => prev.filter((e) => e.id !== expense.id));

      const proj = localProjects.find((p) => p.id === expense.projectId);
      if (proj && (await isConnected())) {
        deleteExpenseFromDrive(iteration, proj, expense).catch((err) =>
          console.warn('Drive delete failed:', err),
        );
      }
    },
    [iteration, localProjects, applySharedExpense],
  );

  const updateExpense = useCallback(
    async (next: Expense): Promise<Expense> => {
      if (next.shareId) {
        const saved = await pushExpense(next.shareId, {
          id: next.id,
          title: next.title,
          date: next.date,
          category: next.category,
          amount: next.amount,
          currency: next.currency,
          notes: next.notes,
          createdAt: next.createdAt,
        });
        if (saved) applySharedExpense(next.shareId, saved);
        return next;
      }
      const old = localExpenses.find((e) => e.id === next.id);
      if (!old) return next;
      const stored = await updateExpenseFs(iteration, old, next);
      setLocalExpenses((prev) =>
        prev.map((e) => (e.id === stored.id ? stored : e)),
      );

      const proj = localProjects.find((p) => p.id === stored.projectId);
      if (proj && (await isConnected())) {
        // The local image lives at the new folder path post-update.
        const fs = await import('./storage');
        const imageUri = await fs.imagePathForExpense(iteration, stored);
        syncExpenseEdit(iteration, proj, old, stored, imageUri).catch((err) =>
          console.warn('Drive edit sync failed:', err),
        );
      }
      return stored;
    },
    [localExpenses, localProjects, iteration, applySharedExpense],
  );

  const moveExpense = useCallback(
    async (expense: Expense, toProjectId: string): Promise<Expense> => {
      if (expense.projectId === toProjectId) return expense;
      // Moving across the shared/personal boundary isn't supported yet — the
      // two stores have different identities and (for shared) no photos.
      const destShared = findShared(toProjectId);
      if (expense.shareId || destShared) {
        throw new Error(
          'Moving receipts in or out of shared projects isn\'t supported yet.',
        );
      }
      const dest = localProjects.find((p) => p.id === toProjectId);
      if (!dest) throw new Error('That project no longer exists.');
      // Keep the category if the destination offers it; otherwise the receipt
      // lands in the destination's always-present Uncategorized bucket.
      const destCats = categoriesForProject(dest).map((c) => c.toLowerCase());
      const category = destCats.includes(expense.category.toLowerCase())
        ? expense.category
        : UNCATEGORIZED;
      const old = expense;
      const next: Expense = { ...old, projectId: toProjectId, category };
      // Moves the receipt's folder into the destination project on disk.
      const stored = await updateExpenseFs(iteration, old, next);
      setLocalExpenses((prev) => prev.map((e) => (e.id === stored.id ? stored : e)));

      if (await isConnected()) {
        const fromProj = localProjects.find((p) => p.id === old.projectId);
        const imageUri = await imagePathForExpense(iteration, stored);
        // Remove from the old project's Drive folder, then add to the new one
        // so the receipt isn't left orphaned in both. Best-effort.
        (async () => {
          if (fromProj) await deleteExpenseFromDrive(iteration, fromProj, old);
          await uploadExpenseToDrive(iteration, dest, stored, imageUri);
        })().catch((err) => console.warn('Drive move sync failed:', err));
      }
      return stored;
    },
    [localProjects, iteration, findShared],
  );

  const attachImage = useCallback(
    async (expense: Expense, imageUri: string): Promise<Expense> => {
      if (expense.shareId) {
        // Upload the new photo to the shared store and update the cached record.
        const imageFilename = shareImageFilename(imageUri);
        await putShareImage(expense.shareId, expense.id, imageUri, imageFilename);
        const sp = sharedProjects.find((s) => s.id === expense.shareId);
        const cur = sp?.expenses.find((e) => e.id === expense.id);
        if (cur) applySharedExpense(expense.shareId, { ...cur, imageFilename });
        return { ...expense, imageFilename };
      }
      const stored = await attachImageToExpenseFs(iteration, expense, imageUri);
      setLocalExpenses((prev) =>
        prev.map((e) => (e.id === stored.id ? stored : e)),
      );
      const proj = localProjects.find((p) => p.id === stored.projectId);
      if (proj && (await isConnected())) {
        uploadExpenseToDrive(iteration, proj, stored, imageUri).catch((err) =>
          console.warn('Drive sync failed:', err),
        );
      }
      return stored;
    },
    [iteration, localProjects, sharedProjects, applySharedExpense],
  );

  const importFromDrive = useCallback(
    async (
      iter: string,
      onProgress: (p: ImportProgress) => void,
    ): Promise<ImportResult> => {
      const existingProjectIds = new Set(localProjects.map((p) => p.id));
      const existingExpenseIds = new Set(localExpenses.map((e) => e.id));
      const result = await importIterationDrive(
        iter,
        existingProjectIds,
        existingExpenseIds,
        onProgress,
      );
      // Reload from disk so in-memory state matches what was just written.
      await loadForIteration(iter);
      return result;
    },
    [localProjects, localExpenses, loadForIteration],
  );

  // --- Shared-project actions -------------------------------------------------

  // Turn a personal project into a shared one: create it on the backend, copy
  // its existing expenses up (metadata only), invite the first collaborator,
  // then drop the local copy so it isn't duplicated. Aborts without touching
  // local data if any backend step fails.
  const shareProject = useCallback(
    async (project: Project, inviteeEmail: string): Promise<Project> => {
      if (project.shareId) {
        throw new Error('This project is already shared.');
      }
      // The category list the collaborator will see — resolved, minus the
      // auto-appended Uncategorized bucket (it's re-added on the other side).
      const categories = categoriesForProject(project).filter(
        (c) => !isProtectedCategory(c),
      );
      const created = await createShare({
        // Reuse the project's id so it keeps its identity once shared.
        id: project.id,
        name: project.name,
        scheme: 'custom',
        categories,
      });

      try {
        // Migrate existing receipts into the shared ledger, preserving ids.
        const toMigrate = localExpenses.filter(
          (e) => e.projectId === project.id,
        );
        for (const e of toMigrate) {
          await pushExpense(created.id, {
            id: e.id,
            title: e.title,
            date: e.date,
            category: e.category,
            amount: e.amount,
            currency: e.currency,
            notes: e.notes,
            imageFilename: e.imageFilename,
            createdAt: e.createdAt,
          });
          // Carry the receipt photo up to the shared store too.
          if (e.imageFilename) {
            const localPath = await imagePathForExpense(iteration, e);
            if (localPath) {
              try {
                await putShareImage(created.id, e.id, localPath, e.imageFilename);
              } catch (err) {
                console.warn('Shared image migration failed:', err);
              }
            }
          }
        }
        await inviteMember(created.id, inviteeEmail);
      } catch (e) {
        // Roll back the half-created share so we don't leave an orphan.
        await leaveShare(created.id).catch(() => {});
        throw e;
      }

      // Drop the local copy now that it lives on the backend.
      await deleteProjectAndExpenses(iteration, project.id);
      setLocalProjects((prev) => prev.filter((p) => p.id !== project.id));
      setLocalExpenses((prev) => prev.filter((e) => e.projectId !== project.id));

      // Pull the authoritative shared state (with members + migrated expenses).
      const fresh = await pullShares();
      setSharedProjects(fresh);
      await writeShareCache(fresh);

      setActiveProject(created.id);
      return sharedToProject(
        fresh.find((s) => s.id === created.id) ?? created,
      );
    },
    [iteration, localExpenses, setActiveProject],
  );

  const inviteToProject = useCallback(
    async (project: Project, email: string): Promise<Project> => {
      if (!project.shareId) throw new Error('This project isn\'t shared.');
      const updated = await inviteMember(project.shareId, email);
      setSharedProjects((prev) => {
        const next = prev.map((s) => (s.id === updated.id ? updated : s));
        writeShareCache(next).catch(() => {});
        return next;
      });
      return sharedToProject(updated);
    },
    [],
  );

  const leaveSharedProject = useCallback(
    async (project: Project): Promise<void> => {
      if (!project.shareId) throw new Error('This project isn\'t shared.');
      await leaveShare(project.shareId);
      setSharedProjects((prev) => {
        const next = prev.filter((s) => s.id !== project.shareId);
        writeShareCache(next).catch(() => {});
        return next;
      });
      if (activeProjectId === project.id) setActiveProject(null);
    },
    [activeProjectId, setActiveProject],
  );

  const value = useMemo<StoreCtx>(
    () => ({
      iteration,
      projects,
      expenses,
      activeProjectId,
      loading,
      setIteration,
      setActiveProject,
      addProject,
      updateProject,
      removeProject,
      addProjectCategory,
      renameProjectCategory,
      deleteProjectCategory,
      saveExpenseAndSync,
      updateExpense,
      moveExpense,
      attachImage,
      removeExpense,
      refresh,
      importFromDrive,
      shareProject,
      inviteToProject,
      leaveSharedProject,
    }),
    [
      iteration,
      projects,
      expenses,
      activeProjectId,
      loading,
      setIteration,
      setActiveProject,
      addProject,
      updateProject,
      removeProject,
      addProjectCategory,
      renameProjectCategory,
      deleteProjectCategory,
      saveExpenseAndSync,
      updateExpense,
      moveExpense,
      attachImage,
      removeExpense,
      refresh,
      importFromDrive,
      shareProject,
      inviteToProject,
      leaveSharedProject,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

export function useActiveProject(): Project | null {
  const { projects, activeProjectId } = useStore();
  return projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;
}
