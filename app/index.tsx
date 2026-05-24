import React, { useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { Screen } from '../components/Screen';
import { Pressable } from '../components/Pressable';
import { useStore, useActiveProject } from '../lib/store';
import { theme } from '../lib/theme';
import { formatMoneyCompact, formatMoney } from '../lib/format';
import { categoriesForProject } from '../lib/categories';

export default function Home() {
  const router = useRouter();
  const {
    projects,
    expenses,
    iteration,
    activeProjectId,
    setActiveProject,
    loading,
    refresh,
  } = useStore();
  const active = useActiveProject();
  const [year, setYear] = useState<number>(new Date().getFullYear());

  useFocusEffect(
    React.useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    expenses
      .filter((e) => !active || e.projectId === active.id)
      .forEach((e) => years.add(new Date(e.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [expenses, active]);

  const projectExpenses = useMemo(() => {
    if (!active) return [];
    return expenses.filter(
      (e) =>
        e.projectId === active.id &&
        new Date(e.date).getFullYear() === year,
    );
  }, [expenses, active, year]);

  const total = projectExpenses.reduce((acc, e) => acc + e.amount, 0);
  const currency = projectExpenses[0]?.currency ?? 'USD';

  const byCategory = useMemo(() => {
    const cats = active ? categoriesForProject(active) : [];
    const map = new Map<string, number>();
    cats.forEach((c) => map.set(c, 0));
    projectExpenses.forEach((e) => {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    });
    return Array.from(map.entries())
      .filter(([, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [projectExpenses, active]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (projects.length === 0) {
    return (
      <Screen style={{ padding: theme.spacing.lg }}>
        <View style={styles.headerRow}>
          <Text style={styles.appTitle}>Schedule E AI</Text>
          <Link href="/settings" asChild>
            <Pressable style={styles.gear}>
              <Text style={styles.gearText}>⚙︎</Text>
            </Pressable>
          </Link>
        </View>
        <View style={styles.emptyHero}>
          <Text style={styles.heroTitle}>Welcome.</Text>
          <Text style={styles.heroSubtitle}>
            Create your first project to start capturing expenses.
          </Text>
          <Pressable
            style={styles.primaryCta}
            onPress={() => router.push('/projects/new')}
          >
            <Text style={styles.primaryCtaText}>New project</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.iterationPill}
          onPress={() => router.push('/settings')}
        >
          <Text style={styles.iterationPillText}>{iteration}</Text>
        </Pressable>
        <Link href="/settings" asChild>
          <Pressable style={styles.gear}>
            <Text style={styles.gearText}>⚙︎</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.projectStrip}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={projects}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}
          ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
          renderItem={({ item }) => {
            const isActive = item.id === (active?.id ?? null);
            return (
              <Pressable
                onPress={() => setActiveProject(item.id)}
                style={[
                  styles.projectChip,
                  isActive && styles.projectChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.projectChipText,
                    isActive && styles.projectChipTextActive,
                  ]}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
          ListFooterComponent={
            <Pressable
              onPress={() => router.push('/projects/new')}
              style={[styles.projectChip, styles.projectChipGhost]}
            >
              <Text style={styles.projectChipGhostText}>+ Project</Text>
            </Pressable>
          }
        />
      </View>

      <View style={styles.totalBlock}>
        <Text style={styles.totalAmount}>
          {formatMoneyCompact(total, currency)}
        </Text>
        <View style={styles.yearRow}>
          {availableYears.map((y) => (
            <Pressable
              key={y}
              onPress={() => setYear(y)}
              style={[styles.yearChip, y === year && styles.yearChipActive]}
            >
              <Text
                style={[
                  styles.yearChipText,
                  y === year && styles.yearChipTextActive,
                ]}
              >
                {y}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={byCategory}
        keyExtractor={([cat]) => cat}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: 120,
        }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.colors.border }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No expenses yet for {year}.</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to add your first receipt.
            </Text>
          </View>
        }
        renderItem={({ item: [category, amount] }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/category/[name]',
                params: { name: category, year: year.toString() },
              })
            }
            style={styles.categoryRow}
          >
            <Text style={styles.categoryName}>{category}</Text>
            <Text style={styles.categoryAmount}>
              {formatMoney(amount, currency)}
            </Text>
          </Pressable>
        )}
      />

      <Pressable
        style={styles.fab}
        onPress={() => router.push('/add')}
        onLongPress={() =>
          router.push({ pathname: '/add', params: { source: 'library' } })
        }
        delayLongPress={300}
      >
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: theme.colors.textMuted, ...theme.type.body },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  appTitle: { ...theme.type.title, color: theme.colors.text },
  iterationPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  iterationPillText: {
    ...theme.type.label,
    color: theme.colors.textMuted,
  },
  gear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  gearText: { fontSize: 18, color: theme.colors.text },
  emptyHero: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'center',
  },
  heroTitle: {
    ...theme.type.display,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  heroSubtitle: {
    ...theme.type.body,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xl,
  },
  primaryCta: {
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryCtaText: {
    color: theme.colors.bg,
    ...theme.type.bodyStrong,
  },
  projectStrip: {
    paddingVertical: theme.spacing.sm,
  },
  projectChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  projectChipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  projectChipText: { ...theme.type.label, color: theme.colors.text },
  projectChipTextActive: { color: theme.colors.bg },
  projectChipGhost: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  projectChipGhostText: { ...theme.type.label, color: theme.colors.textMuted },
  totalBlock: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  totalAmount: {
    ...theme.type.display,
    fontSize: 48,
    color: theme.colors.text,
  },
  yearRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.md,
    gap: 8,
  },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  yearChipActive: { backgroundColor: theme.colors.accentSoft },
  yearChipText: { ...theme.type.label, color: theme.colors.textMuted },
  yearChipTextActive: { color: theme.colors.accent },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
  },
  categoryName: { ...theme.type.body, color: theme.colors.text },
  categoryAmount: { ...theme.type.bodyStrong, color: theme.colors.text },
  emptyState: {
    paddingTop: theme.spacing.xxl,
    alignItems: 'center',
  },
  emptyTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    marginBottom: 4,
  },
  emptySubtitle: { ...theme.type.body, color: theme.colors.textMuted },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  fabPlus: { fontSize: 32, color: '#fff', marginTop: -2 },
});
