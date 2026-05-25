import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../components/Screen';
import { Pressable } from '../../components/Pressable';
import { useStore, useActiveProject } from '../../lib/store';
import { theme } from '../../lib/theme';
import { formatDate, formatMoney, moneyTextStyle } from '../../lib/format';

export default function CategoryView() {
  const router = useRouter();
  const { name, year } = useLocalSearchParams<{ name: string; year?: string }>();
  const { expenses } = useStore();
  const active = useActiveProject();
  const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

  const items = useMemo(() => {
    if (!active) return [];
    return expenses
      .filter(
        (e) =>
          e.projectId === active.id &&
          e.category === name &&
          new Date(e.date).getFullYear() === targetYear,
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [expenses, active, name, targetYear]);

  const total = items.reduce((acc, e) => acc + e.amount, 0);
  const currency = items[0]?.currency ?? 'USD';

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hapticOnPress="select"
          hitSlop={8}
        >
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{targetYear}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {name}
          </Text>
          <Text style={[styles.total, moneyTextStyle]}>
            {formatMoney(total, currency)}
          </Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => (
          <View
            style={{ height: 1, backgroundColor: theme.colors.border }}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No expenses in this category.</Text>
        }
        renderItem={({ item }) => (
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
            <View style={{ flex: 1, marginRight: 12 }}>
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
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    alignItems: 'flex-start',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    marginTop: 4,
  },
  backText: { fontSize: 22, color: theme.colors.text },
  eyebrow: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  title: { ...theme.type.title, color: theme.colors.text, marginTop: 2 },
  total: {
    ...theme.type.display,
    color: theme.colors.text,
    marginTop: 6,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  itemTitle: { ...theme.type.body, color: theme.colors.text },
  itemDate: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  itemAmount: { ...theme.type.bodyStrong, color: theme.colors.text },
  empty: {
    ...theme.type.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.xxl,
  },
});
