import React, { useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Screen } from '../components/Screen';
import { Pressable } from '../components/Pressable';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { useStore, useActiveProject } from '../lib/store';
import { theme, swatchFor } from '../lib/theme';
import { categoriesForProject } from '../lib/categories';

export default function Home() {
  const router = useRouter();
  const { projects, expenses, iteration, setActiveProject, loading, refresh } =
    useStore();
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

  const lastYearTotal = useMemo(() => {
    if (!active) return 0;
    return expenses
      .filter(
        (e) =>
          e.projectId === active.id &&
          new Date(e.date).getFullYear() === year - 1,
      )
      .reduce((acc, e) => acc + e.amount, 0);
  }, [expenses, active, year]);

  const byCategory = useMemo(() => {
    const cats = active ? categoriesForProject(active) : [];
    const map = new Map<string, { amount: number; count: number }>();
    cats.forEach((c) => map.set(c, { amount: 0, count: 0 }));
    projectExpenses.forEach((e) => {
      const cur = map.get(e.category) ?? { amount: 0, count: 0 };
      map.set(e.category, {
        amount: cur.amount + e.amount,
        count: cur.count + 1,
      });
    });
    return Array.from(map.entries())
      .filter(([, v]) => v.amount > 0)
      .sort((a, b) => b[1].amount - a[1].amount);
  }, [projectExpenses, active]);

  const maxCategoryAmount = byCategory[0]?.[1].amount ?? 0;

  if (loading) {
    return (
      <Screen>
        <View style={styles.headerRow}>
          <View style={[styles.skel, { width: 70, height: 18 }]} />
          <View style={[styles.skel, { width: 32, height: 32, borderRadius: 16 }]} />
        </View>
        <View style={styles.totalBlock}>
          <View style={[styles.skel, { width: 80, height: 12 }]} />
          <View
            style={[
              styles.skel,
              { width: 220, height: 56, marginTop: theme.spacing.sm },
            ]}
          />
        </View>
        <View style={{ paddingHorizontal: theme.spacing.lg }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.skel,
                {
                  height: 56,
                  marginBottom: theme.spacing.sm,
                  borderRadius: theme.radius.md,
                },
              ]}
            />
          ))}
        </View>
      </Screen>
    );
  }

  if (projects.length === 0) {
    return (
      <Screen style={{ padding: theme.spacing.lg }}>
        <View style={styles.headerRow}>
          <Text style={styles.appTitle}>Schedule E AI</Text>
          <Pressable
            haptic="selection"
            style={styles.iconBtn}
            onPress={() => router.push('/settings')}
          >
            <Icon name="settings" size={18} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={styles.emptyHero}>
          <Text style={styles.eyebrow}>Get started</Text>
          <Text style={styles.heroTitle}>A quiet place for receipts.</Text>
          <Text style={styles.heroSubtitle}>
            Create your first property or project to start capturing expenses.
          </Text>
          <Pressable
            haptic="selection"
            style={styles.primaryCta}
            onPress={() => router.push('/projects/new')}
          >
            <Text style={styles.primaryCtaText}>New project</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const delta = total - lastYearTotal;
  const showDelta = lastYearTotal > 0;
  const deltaPositive = delta >= 0;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={styles.titleStack}>
          <Text style={styles.iterationGlyph}>{`Iteration ${iteration}`}</Text>
          <Text style={styles.projectTitle} numberOfLines={1}>
            {active?.name ?? 'Schedule E AI'}
          </Text>
        </View>
        <Pressable
          haptic="selection"
          style={styles.iconBtn}
          onPress={() => router.push('/settings')}
        >
          <Icon name="settings" size={18} color={theme.colors.text} />
        </Pressable>
      </View>

      {projects.length > 1 && (
        <View style={styles.projectStrip}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={projects}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{
              paddingHorizontal: theme.spacing.lg,
            }}
            ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
            renderItem={({ item }) => {
              const isActive = item.id === (active?.id ?? null);
              return (
                <Pressable
                  haptic="selection"
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
                haptic="selection"
                onPress={() => router.push('/projects/new')}
                style={[styles.projectChip, styles.projectChipGhost]}
              >
                <Text style={styles.projectChipGhostText}>+ Project</Text>
              </Pressable>
            }
          />
        </View>
      )}

      <Animated.View
        entering={FadeInDown.duration(360).springify().damping(18)}
        style={styles.totalBlock}
      >
        <Text style={styles.eyebrow}>{`Total · ${year}`}</Text>
        <Money
          amount={total}
          currency={currency}
          size="hero"
          compact
          style={{ marginTop: theme.spacing.xs }}
        />
        {showDelta && (
          <View style={styles.deltaRow}>
            <Icon
              name={deltaPositive ? 'arrow-up-right' : 'arrow-down-right'}
              size={14}
              color={
                deltaPositive ? theme.colors.danger : theme.colors.success
              }
            />
            <Money
              amount={Math.abs(delta)}
              currency={currency}
              size="body"
              compact
              color={
                deltaPositive ? theme.colors.danger : theme.colors.success
              }
              style={{ marginLeft: 4 }}
            />
            <Text style={styles.deltaLabel}>{`vs ${year - 1}`}</Text>
          </View>
        )}
      </Animated.View>

      {availableYears.length > 1 && (
        <View style={styles.yearSegment}>
          {availableYears.map((y) => {
            const isActive = y === year;
            return (
              <Pressable
                key={y}
                haptic="selection"
                onPress={() => setYear(y)}
                style={[
                  styles.yearChip,
                  isActive && styles.yearChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.yearChipText,
                    isActive && styles.yearChipTextActive,
                  ]}
                >
                  {y}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <FlatList
        data={byCategory}
        keyExtractor={([cat]) => cat}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: 140,
        }}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: theme.colors.divider }} />
        )}
        ListEmptyComponent={
          <EmptyState
            year={year}
            projectName={active?.name}
            onCapture={() => router.push('/add')}
          />
        }
        renderItem={({ item: [category, stats], index }) => (
          <Animated.View
            entering={FadeIn.delay(index * 30).duration(280)}
            layout={Layout.springify().damping(20)}
          >
            <CategoryRow
              name={category}
              amount={stats.amount}
              count={stats.count}
              currency={currency}
              share={maxCategoryAmount > 0 ? stats.amount / maxCategoryAmount : 0}
              onPress={() =>
                router.push({
                  pathname: '/category/[name]',
                  params: { name: category, year: year.toString() },
                })
              }
            />
          </Animated.View>
        )}
      />

      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable
          haptic="medium"
          pressScale={0.93}
          style={styles.fab}
          onPress={() => router.push('/add')}
          onLongPress={() =>
            router.push({ pathname: '/add', params: { source: 'library' } })
          }
          delayLongPress={300}
        >
          <Icon name="camera" size={26} color="#fff" />
          <View style={styles.fabBadge}>
            <Icon name="plus" size={11} color={theme.colors.accent} />
          </View>
        </Pressable>
      </View>
    </Screen>
  );
}

function CategoryRow({
  name,
  amount,
  count,
  currency,
  share,
  onPress,
}: {
  name: string;
  amount: number;
  count: number;
  currency: string;
  share: number;
  onPress: () => void;
}) {
  const swatch = swatchFor(name);
  return (
    <Pressable
      haptic="selection"
      pressScale={0.99}
      onPress={onPress}
      style={styles.categoryRow}
    >
      <View style={[styles.swatch, { backgroundColor: swatch }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.categoryName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.max(4, share * 100)}%`,
                backgroundColor: swatch,
              },
            ]}
          />
        </View>
        <Text style={styles.categoryMeta}>
          {count} {count === 1 ? 'receipt' : 'receipts'}
        </Text>
      </View>
      <Money
        amount={amount}
        currency={currency}
        size="sm"
        style={{ marginLeft: theme.spacing.md }}
      />
    </Pressable>
  );
}

function EmptyState({
  year,
  projectName,
  onCapture,
}: {
  year: number;
  projectName?: string;
  onCapture: () => void;
}) {
  // Subtle pulsing dot to feel alive rather than dead.
  const pulse = useSharedValue(0.5);
  React.useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.6,
  }));

  return (
    <View style={styles.emptyState}>
      <Animated.View style={[styles.emptyDot, pulseStyle]} />
      <Text style={styles.emptyTitle}>
        Nothing logged for {projectName ?? 'this project'} in {year}.
      </Text>
      <Text style={styles.emptySubtitle}>
        Tap the camera to capture your first receipt.
      </Text>
      <Pressable
        haptic="selection"
        style={styles.emptyCta}
        onPress={onCapture}
      >
        <Icon name="camera" size={16} color={theme.colors.text} />
        <Text style={styles.emptyCtaText}>Capture receipt</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  skel: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  titleStack: { flexShrink: 1 },
  iterationGlyph: {
    ...theme.type.caption,
    color: theme.colors.textSubtle,
    textTransform: 'uppercase',
  },
  projectTitle: {
    ...theme.type.title,
    color: theme.colors.text,
    marginTop: 2,
  },
  appTitle: { ...theme.type.title, color: theme.colors.text },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHero: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'center',
  },
  heroTitle: {
    ...theme.type.display,
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
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
    borderColor: theme.colors.divider,
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
    paddingBottom: theme.spacing.sm,
  },
  eyebrow: {
    ...theme.type.eyebrow,
    color: theme.colors.textSubtle,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  deltaLabel: {
    ...theme.type.caption,
    color: theme.colors.textSubtle,
    marginLeft: theme.spacing.xs,
  },
  yearSegment: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.pill,
    padding: 4,
  },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  yearChipActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadow.card,
  },
  yearChipText: { ...theme.type.label, color: theme.colors.textMuted },
  yearChipTextActive: { color: theme.colors.text },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  swatch: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: theme.spacing.md,
  },
  categoryName: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  categoryMeta: {
    ...theme.type.caption,
    color: theme.colors.textSubtle,
    marginTop: 2,
  },
  barTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceAlt,
    marginTop: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  emptyState: {
    paddingTop: theme.spacing.xxl,
    alignItems: 'center',
  },
  emptyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    marginBottom: 4,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  emptySubtitle: {
    ...theme.type.body,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  emptyCtaText: {
    ...theme.type.label,
    color: theme.colors.text,
    marginLeft: 6,
  },
  fabWrap: {
    position: 'absolute',
    right: theme.spacing.lg,
    bottom: theme.spacing.xl,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.floating,
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.bg,
  },
});
