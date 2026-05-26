import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Screen } from '../../components/Screen';
import { Pressable } from '../../components/Pressable';
import { AnimatedTotal } from '../../components/AnimatedTotal';
import { useStore, useActiveProject } from '../../lib/store';
import { theme } from '../../lib/theme';
import { formatDate, formatMoney, moneyTextStyle } from '../../lib/format';
import { isPending, subscribePending } from '../../lib/pendingDelete';

const STAGGER_MS = 45;
const MAX_STAGGER_INDEX = 8;

export default function CategoryView() {
  const router = useRouter();
  const { name, year } = useLocalSearchParams<{ name: string; year?: string }>();
  const { expenses } = useStore();
  const active = useActiveProject();
  const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
  const [, setPendingTick] = useState(0);

  useEffect(() => {
    return subscribePending(() => setPendingTick((t) => t + 1));
  }, []);

  const items = useMemo(() => {
    if (!active) return [];
    return expenses
      .filter(
        (e) =>
          e.projectId === active.id &&
          e.category === name &&
          new Date(e.date).getFullYear() === targetYear &&
          !isPending(e.id),
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [expenses, active, name, targetYear]);

  const total = items.reduce((acc, e) => acc + e.amount, 0);
  const currency = items[0]?.currency ?? 'USD';
  const count = items.length;
  const subtitle =
    count === 0
      ? `No receipts in ${targetYear}`
      : `${count} receipt${count === 1 ? '' : 's'}`;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hapticOnPress="select"
          hitSlop={8}
        >
          <Text style={styles.backText}>←</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Animated.Text
          entering={FadeInUp.duration(280)}
          style={styles.eyebrow}
        >
          {(name ?? '').toUpperCase()}  ·  {targetYear}
        </Animated.Text>
        <View style={styles.totalWrap}>
          <AnimatedTotal amount={total} currency={currency} />
        </View>
        <Animated.Text
          entering={FadeInUp.duration(320).delay(120)}
          style={styles.subtitle}
        >
          {subtitle}
        </Animated.Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyDot} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyBody}>
              Receipts you tag as {name} will appear here.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const delay =
            220 + Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS;
          return (
            <Animated.View entering={FadeInUp.duration(280).delay(delay)}>
              <Pressable
                style={styles.row}
                hapticOnPress="select"
                onPress={() =>
                  router.push({
                    pathname: '/expense/[id]',
                    params: { id: item.id },
                  })
                }
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.itemDate} numberOfLines={1}>
                    {formatDate(item.date)}
                  </Text>
                </View>
                <Text style={[styles.itemAmount, moneyTextStyle]}>
                  {formatMoney(item.amount, item.currency)}
                </Text>
              </Pressable>
            </Animated.View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 18,
    color: theme.colors.text,
    marginTop: -2,
  },
  hero: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  eyebrow: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    letterSpacing: 1.2,
    fontWeight: '600',
    marginBottom: 12,
  },
  totalWrap: {
    marginBottom: 10,
  },
  subtitle: {
    ...theme.type.body,
    color: theme.colors.textMuted,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 14,
  },
  rowLeft: {
    flex: 1,
  },
  itemTitle: { ...theme.type.body, color: theme.colors.text },
  itemDate: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: 3,
  },
  itemAmount: { ...theme.type.bodyStrong, color: theme.colors.text },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.md,
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
