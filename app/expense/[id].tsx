import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Screen } from '../../components/Screen';
import { Pressable } from '../../components/Pressable';
import { useStore } from '../../lib/store';
import { theme } from '../../lib/theme';
import { formatDate, formatMoney } from '../../lib/format';
import { imagePathForExpense } from '../../lib/storage';

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { expenses, iteration, removeExpense, projects } = useStore();
  const expense = expenses.find((e) => e.id === id);
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    if (!expense) return;
    imagePathForExpense(iteration, expense).then(setImageUri);
  }, [expense, iteration]);

  if (!expense) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={{ color: theme.colors.textMuted }}>
            Expense not found.
          </Text>
        </View>
      </Screen>
    );
  }

  const project = projects.find((p) => p.id === expense.projectId);

  function confirmDelete() {
    Alert.alert('Delete expense?', 'This removes the receipt locally.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!expense) return;
          await removeExpense(expense);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Pressable onPress={confirmDelete}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>

        <Text style={styles.amount}>
          {formatMoney(expense.amount, expense.currency)}
        </Text>
        <Text style={styles.title}>{expense.title}</Text>

        <View style={styles.metaCard}>
          <Row label="Date" value={formatDate(expense.date)} />
          <Row label="Category" value={expense.category} />
          {project && <Row label="Project" value={project.name} />}
        </View>

        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={styles.receiptImage}
            contentFit="cover"
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 22, color: theme.colors.text },
  deleteText: { ...theme.type.body, color: theme.colors.danger },
  amount: { ...theme.type.display, color: theme.colors.text },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
    marginTop: 6,
    marginBottom: theme.spacing.lg,
  },
  metaCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: { ...theme.type.label, color: theme.colors.textMuted },
  rowValue: { ...theme.type.body, color: theme.colors.text },
  receiptImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceAlt,
  },
});
