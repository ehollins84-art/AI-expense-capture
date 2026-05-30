import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { Screen } from '../components/Screen';
import { Pressable } from '../components/Pressable';
import { SearchField } from '../components/SearchField';
import { SearchResultRow } from '../components/SearchResultRow';
import { useStore, useActiveProject } from '../lib/store';
import { theme } from '../lib/theme';
import { searchExpenses } from '../lib/search';
import { isPending, subscribePending } from '../lib/pendingDelete';
import { categoriesForProject } from '../lib/categories';
import type { SearchMatch } from '../lib/search';
import type { Expense, Project } from '../lib/types';

export default function Search() {
  const router = useRouter();
  const { expenses, projects } = useStore();
  const activeProject = useActiveProject();

  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | null>(
    activeProject?.id ?? null,
  );
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [, setPendingTick] = useState(0);

  useEffect(() => {
    return subscribePending(() => setPendingTick((t) => t + 1));
  }, []);

  const visibleExpenses = useMemo(
    () => expenses.filter((e) => !isPending(e.id)),
    [expenses, projects.length],
  );

  const results: SearchMatch[] = useMemo(() => {
    if (!query.trim()) return [];
    return searchExpenses(visibleExpenses, projects, query, {
      projectId: projectFilter,
      year: yearFilter,
      category: categoryFilter,
    });
  }, [visibleExpenses, projects, query, projectFilter, yearFilter, categoryFilter]);

  const recents: Expense[] = useMemo(() => {
    if (query.trim()) return [];
    const pool = projectFilter
      ? visibleExpenses.filter((e) => e.projectId === projectFilter)
      : visibleExpenses;
    return [...pool]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 8);
  }, [visibleExpenses, projectFilter, query]);

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    results.forEach((m) => years.add(new Date(m.expense.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [results]);

  const availableCategories = useMemo(() => {
    if (projectFilter) {
      const p = projectById.get(projectFilter);
      return p ? categoriesForProject(p) : [];
    }
    const set = new Set<string>();
    results.forEach((m) => set.add(m.expense.category));
    return Array.from(set).sort();
  }, [projectFilter, projectById, results]);

  function cycleProject() {
    setProjectFilter((prev) => (prev ? null : activeProject?.id ?? null));
  }

  function cycleYear() {
    if (availableYears.length === 0) return;
    setYearFilter((prev) => {
      if (prev === null) return availableYears[0];
      const idx = availableYears.indexOf(prev);
      if (idx === -1 || idx === availableYears.length - 1) return null;
      return availableYears[idx + 1];
    });
  }

  function cycleCategory() {
    if (availableCategories.length === 0) return;
    setCategoryFilter((prev) => {
      if (prev === null) return availableCategories[0];
      const idx = availableCategories.indexOf(prev);
      if (idx === -1 || idx === availableCategories.length - 1) return null;
      return availableCategories[idx + 1];
    });
  }

  function clearFilters() {
    setProjectFilter(activeProject?.id ?? null);
    setYearFilter(null);
    setCategoryFilter(null);
  }

  function openExpense(id: string) {
    Keyboard.dismiss();
    router.push({ pathname: '/expense/[id]', params: { id } });
  }

  const anyFilterActive =
    projectFilter !== (activeProject?.id ?? null) ||
    yearFilter !== null ||
    categoryFilter !== null;

  const showFilters = query.trim().length > 0;

  const projectPillLabel = projectFilter
    ? projectById.get(projectFilter)?.name ?? 'This project'
    : 'All projects';

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <SearchField
          value={query}
          onChangeText={setQuery}
          onCancel={() => router.back()}
          onSubmitEditing={Keyboard.dismiss}
        />

        {showFilters && (
          <View style={styles.filterRow}>
            <Pressable
              hapticOnPress="select"
              onPress={cycleProject}
              style={[
                styles.filterPill,
                projectFilter && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  projectFilter && styles.filterPillTextActive,
                ]}
                numberOfLines={1}
              >
                {projectPillLabel}
              </Text>
            </Pressable>
            <Pressable
              hapticOnPress="select"
              onPress={cycleYear}
              style={[
                styles.filterPill,
                yearFilter !== null && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  yearFilter !== null && styles.filterPillTextActive,
                ]}
              >
                {yearFilter ?? 'All years'}
              </Text>
            </Pressable>
            <Pressable
              hapticOnPress="select"
              onPress={cycleCategory}
              style={[
                styles.filterPill,
                categoryFilter !== null && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  categoryFilter !== null && styles.filterPillTextActive,
                ]}
                numberOfLines={1}
              >
                {categoryFilter ?? 'All categories'}
              </Text>
            </Pressable>
            {anyFilterActive && (
              <Pressable
                hapticOnPress="select"
                onPress={clearFilters}
                hitSlop={6}
                style={styles.clearBtn}
              >
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            )}
          </View>
        )}

        {query.trim() ? (
          <FlatList
            data={results}
            keyExtractor={(m) => m.expense.id}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No matches</Text>
                <Text style={styles.emptyBody}>
                  Try a project, amount, or date.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <SearchResultRow
                match={item}
                query={query}
                project={projectById.get(item.expense.projectId)}
                onPress={() => openExpense(item.expense.id)}
              />
            )}
          />
        ) : (
          <FlatList
            data={recents}
            keyExtractor={(e) => e.id}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              recents.length > 0 ? (
                <Text style={styles.sectionHeader}>RECENTS</Text>
              ) : null
            }
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No receipts yet</Text>
                <Text style={styles.emptyBody}>
                  Capture one from the home screen.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <SearchResultRow
                match={{ expense: item, score: 0, field: 'title' }}
                query=""
                project={projectById.get(item.projectId)}
                onPress={() => openExpense(item.id)}
              />
            )}
          />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    maxWidth: 160,
  },
  filterPillActive: {
    backgroundColor: theme.colors.text,
  },
  filterPillText: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: theme.colors.bg,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearText: {
    ...theme.type.label,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  sectionHeader: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingTop: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    marginBottom: 6,
  },
  emptyBody: {
    ...theme.type.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
