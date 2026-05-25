import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Screen';
import { Pressable } from '../components/Pressable';
import { CameraIcon } from '../components/CameraIcon';
import { useStore, useActiveProject } from '../lib/store';
import { theme } from '../lib/theme';
import { formatMoneyCompact, formatMoney, moneyTextStyle } from '../lib/format';
import { categoriesForProject } from '../lib/categories';
import { haptic } from '../lib/haptics';
import { isPending, subscribePending } from '../lib/pendingDelete';

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    projects,
    expenses,
    iteration,
    setActiveProject,
    loading,
    refresh,
  } = useStore();
  const active = useActiveProject();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [refreshing, setRefreshing] = useState(false);
  const [, setPendingTick] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    return subscribePending(() => setPendingTick((t) => t + 1));
  }, []);

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
        new Date(e.date).getFullYear() === year &&
        !isPending(e.id),
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

  const maxCategoryAmount = byCategory.reduce(
    (m, [, amt]) => Math.max(m, amt),
    0,
  );

  async function handleRefresh() {
    setRefreshing(true);
    haptic.light();
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

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
            <Pressable style={styles.gear} hitSlop={8} hapticOnPress="select">
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
            hapticOnPress="light"
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
          style={styles.backupPill}
          hapticOnPress="select"
          hitSlop={6}
          onPress={() => router.push('/settings')}
        >
          <View style={styles.backupDot} />
          <Text style={styles.backupPillText}>Backup {iteration}</Text>
        </Pressable>
        <Link href="/settings" asChild>
          <Pressable
            style={styles.gear}
            hitSlop={8}
            hapticOnPress="select"
          >
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
                hapticOnPress="select"
                onPress={() => setActiveProject(item.id)}
                style={[
                  styles.projectChip,
                  isActive && styles.projectChipActive,
                ]}
              >
                <Text
                  numberOfLines={1}
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
              hapticOnPress="select"
              onPress={() => router.push('/projects/new')}
              style={[styles.projectChip, styles.projectChipGhost]}
            >
              <Text style={styles.projectChipGhostText}>+ Project</Text>
            </Pressable>
          }
        />
      </View>

      <View style={styles.totalBlock}>
        <Text style={styles.totalEyebrow}>Total · {year}</Text>
        <Text style={[styles.totalAmount, moneyTextStyle]}>
          {formatMoneyCompact(total, currency)}
        </Text>
        <View style={styles.yearRow}>
          {availableYears.map((y) => (
            <Pressable
              key={y}
              hapticOnPress="select"
              onPress={() => setYear(y)}
              style={[styles.yearChip, y === year && styles.yearChipActive]}
            >
              <Text
                style={[
                  styles.yearChipText,
                  moneyTextStyle,
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
          paddingBottom: 140,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No expenses yet for {year}.</Text>
            <Text style={styles.emptySubtitle}>
              Tap the camera button to capture your first receipt.
            </Text>
          </View>
        }
        renderItem={({ item: [category, amount] }) => (
          <CategoryRow
            name={category}
            amount={amount}
            currency={currency}
            share={maxCategoryAmount > 0 ? amount / maxCategoryAmount : 0}
            onPress={() =>
              router.push({
                pathname: '/category/[name]',
                params: { name: category, year: year.toString() },
              })
            }
          />
        )}
      />

      <Pressable
        style={[
          styles.fab,
          { bottom: Math.max(insets.bottom + 16, 28) },
        ]}
        hapticOnPress="medium"
        scaleTo={0.92}
        onPress={() => router.push('/add')}
        onLongPress={() => {
          haptic.light();
          router.push({ pathname: '/add', params: { source: 'library' } });
        }}
        delayLongPress={300}
        hitSlop={8}
      >
        <CameraIcon size={28} color="#fff" />
      </Pressable>

    </Screen>
  );
}

function CategoryRow({
  name,
  amount,
  currency,
  share,
  onPress,
}: {
  name: string;
  amount: number;
  currency: string;
  share: number;
  onPress: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: share,
      useNativeDriver: false,
      speed: 8,
      bounciness: 4,
    }).start();
  }, [share]);

  return (
    <Pressable hapticOnPress="select" onPress={onPress} style={styles.categoryRow}>
      <View style={styles.categoryTopRow}>
        <Text style={styles.categoryName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.categoryAmount, moneyTextStyle]}>
          {formatMoney(amount, currency)}
        </Text>
      </View>
      <View style={styles.categoryBarTrack}>
        <Animated.View
          style={[
            styles.categoryBarFill,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </Pressable>
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
  backupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  backupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success,
    marginRight: 8,
  },
  backupPillText: {
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
    maxWidth: 200,
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
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  totalEyebrow: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 56,
    fontWeight: '600',
    letterSpacing: -1,
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
    paddingVertical: 16,
  },
  categoryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  categoryName: { ...theme.type.body, color: theme.colors.text, flex: 1 },
  categoryAmount: { ...theme.type.bodyStrong, color: theme.colors.text },
  categoryBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: 2,
  },
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
});
