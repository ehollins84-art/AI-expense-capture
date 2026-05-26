import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { theme } from '../lib/theme';
import { formatDate, formatMoney, moneyTextStyle } from '../lib/format';
import { highlightSubstring } from '../lib/search';
import type { SearchMatch } from '../lib/search';
import type { Project } from '../lib/types';

function HighlightedText({
  text,
  query,
  style,
  numberOfLines,
}: {
  text: string;
  query: string;
  style: any;
  numberOfLines?: number;
}) {
  const parts = useMemo(() => highlightSubstring(text, query), [text, query]);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => (
        <Text
          key={i}
          style={part.matched ? { fontWeight: '700', color: theme.colors.text } : undefined}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

export function SearchResultRow({
  match,
  query,
  project,
  onPress,
}: {
  match: SearchMatch;
  query: string;
  project?: Project;
  onPress: () => void;
}) {
  const { expense, snippet } = match;

  const eyebrowSegments = [
    project?.name,
    expense.category,
    formatDate(expense.date),
  ].filter((s): s is string => !!s);

  return (
    <Pressable hapticOnPress="select" onPress={onPress} style={styles.row}>
      <View style={styles.left}>
        <HighlightedText
          text={expense.title}
          query={query}
          style={styles.title}
          numberOfLines={1}
        />
        <Text style={styles.eyebrow} numberOfLines={1}>
          {eyebrowSegments.join(' · ')}
        </Text>
        {snippet && (
          <HighlightedText
            text={snippet}
            query={query}
            style={styles.snippet}
            numberOfLines={1}
          />
        )}
      </View>
      <Text style={[styles.amount, moneyTextStyle]}>
        {formatMoney(expense.amount, expense.currency)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14,
    gap: 14,
  },
  left: {
    flex: 1,
  },
  title: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  eyebrow: {
    ...theme.type.label,
    color: theme.colors.textMuted,
    marginTop: 3,
  },
  snippet: {
    ...theme.type.label,
    color: theme.colors.textSubtle,
    fontStyle: 'italic',
    marginTop: 3,
  },
  amount: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
});
