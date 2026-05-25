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
} from './storage';
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
  saveExpenseAndSync: (
    expense: Omit<Expense, 'id' | 'createdAt' | 'imageFilename'>,
    imageUri: string,
  ) => Promise<Expense>;
  updateExpense: (expense: Expense) => Promise<Expense>;
  removeExpense: (expense: Expense) => Promise<void>;
  refresh: () => Promise<void>;
  importFromDrive: (
    iter: string,
    onProgress: (p: ImportProgress) => void,
  ) => Promise<ImportResult>;
};

const ACTIVE_PROJECT_KEY = 'activeProjectId';

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [iteration, setIterationState] = useState<string>('A');
  const [projects, setProjects] = useState<Project[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const loadForIteration = useCallback(async (letter: string) => {
    await ensureIteration(letter);
    const [p, e] = await Promise.all([readProjects(letter), readExpenses(letter)]);
    setProjects(p);
    setExpenses(e);
    return { projects: p, expenses: e };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cloudIter = await getStoredIteration();
        const all = await listIterations();
        const start = cloudIter ?? all[0] ?? 'A';
        setIterationState(start);
        await loadForIteration(start);

        const ap = await AsyncStorage.getItem(ACTIVE_PROJECT_KEY);
        if (ap) setActiveProjectIdState(ap);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadForIteration]);

  const refresh = useCallback(async () => {
    await loadForIteration(iteration);
  }, [iteration, loadForIteration]);

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
      const next = [...projects, project];
      await writeProjects(iteration, next);
      setProjects(next);
      setActiveProject(project.id);

      if (await isConnected()) {
        uploadProjectManifest(iteration, project).catch((err) =>
          console.warn('Project manifest upload failed:', err),
        );
      }
      return project;
    },
    [projects, iteration, setActiveProject],
  );

  const saveExpenseAndSync = useCallback(
    async (
      input: Omit<Expense, 'id' | 'createdAt' | 'imageFilename'>,
      imageUri: string,
    ): Promise<Expense> => {
      const expense: Expense = {
        ...input,
        id: newId(),
        createdAt: new Date().toISOString(),
        imageFilename: 'receipt.jpg',
      };
      const stored = await saveExpense(iteration, expense, imageUri);
      setExpenses((prev) => [...prev, stored]);

      const proj = projects.find((p) => p.id === stored.projectId);
      if (proj && (await isConnected())) {
        uploadExpenseToDrive(iteration, proj, stored, imageUri).catch((err) =>
          console.warn('Drive sync failed:', err),
        );
      }
      return stored;
    },
    [iteration, projects],
  );

  const removeExpense = useCallback(
    async (expense: Expense) => {
      await deleteExpenseFs(iteration, expense);
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id));

      const proj = projects.find((p) => p.id === expense.projectId);
      if (proj && (await isConnected())) {
        deleteExpenseFromDrive(iteration, proj, expense).catch((err) =>
          console.warn('Drive delete failed:', err),
        );
      }
    },
    [iteration, projects],
  );

  const updateExpense = useCallback(
    async (next: Expense): Promise<Expense> => {
      const old = expenses.find((e) => e.id === next.id);
      if (!old) return next;
      const stored = await updateExpenseFs(iteration, old, next);
      setExpenses((prev) =>
        prev.map((e) => (e.id === stored.id ? stored : e)),
      );

      const proj = projects.find((p) => p.id === stored.projectId);
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
    [expenses, projects, iteration],
  );

  const importFromDrive = useCallback(
    async (
      iter: string,
      onProgress: (p: ImportProgress) => void,
    ): Promise<ImportResult> => {
      const existingProjectIds = new Set(projects.map((p) => p.id));
      const existingExpenseIds = new Set(expenses.map((e) => e.id));
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
    [projects, expenses, loadForIteration],
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
      saveExpenseAndSync,
      updateExpense,
      removeExpense,
      refresh,
      importFromDrive,
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
      saveExpenseAndSync,
      updateExpense,
      removeExpense,
      refresh,
      importFromDrive,
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
