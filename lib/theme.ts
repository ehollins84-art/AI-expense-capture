export const theme = {
  colors: {
    bg: '#FAFAF7',
    surface: '#FFFFFF',
    surfaceAlt: '#F4F2EC',
    surfaceSunken: '#EDEAE0',
    border: '#ECE9E1',
    divider: 'rgba(27,27,27,0.06)',
    scrim: 'rgba(20,18,14,0.55)',
    text: '#1B1B1B',
    textMuted: '#6B6B6B',
    textSubtle: '#9A968B',
    accent: '#C6633A',
    accentSoft: '#F4E3D7',
    accentSubtle: '#E89870',
    success: '#3F7D5C',
    danger: '#B5443A',
    // Per-category swatch palette (warm, distinct, muted)
    swatches: [
      '#C6633A',
      '#3F7D5C',
      '#8C6B3B',
      '#5B6E8F',
      '#B5443A',
      '#7A6594',
      '#4F8A7E',
      '#A86C5A',
      '#6A7B45',
      '#8A4E73',
      '#A38B3B',
      '#5C5C5C',
    ],
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 20,
    pill: 999,
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  },
  type: {
    display: {
      fontSize: 34,
      fontWeight: '600' as const,
      letterSpacing: -0.5,
      lineHeight: 40,
    },
    title: {
      fontSize: 22,
      fontWeight: '600' as const,
      letterSpacing: -0.2,
      lineHeight: 28,
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 22,
    },
    bodyStrong: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    label: {
      fontSize: 13,
      fontWeight: '500' as const,
      letterSpacing: 0.2,
      lineHeight: 18,
    },
    caption: {
      fontSize: 12,
      fontWeight: '500' as const,
      letterSpacing: 0.4,
      lineHeight: 16,
    },
    eyebrow: {
      fontSize: 11,
      fontWeight: '600' as const,
      letterSpacing: 1.2,
      lineHeight: 14,
      textTransform: 'uppercase' as const,
    },
    mono: {
      fontSize: 15,
      fontWeight: '500' as const,
      lineHeight: 20,
    },
    numeral: {
      fontSize: 56,
      fontWeight: '300' as const,
      letterSpacing: -1.6,
      lineHeight: 62,
      fontVariant: ['tabular-nums' as const],
    },
    numeralMd: {
      fontSize: 22,
      fontWeight: '500' as const,
      letterSpacing: -0.3,
      lineHeight: 26,
      fontVariant: ['tabular-nums' as const],
    },
    numeralSm: {
      fontSize: 15,
      fontWeight: '500' as const,
      letterSpacing: -0.1,
      lineHeight: 20,
      fontVariant: ['tabular-nums' as const],
    },
  },
  shadow: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    floating: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 10,
    },
    modal: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 24 },
      shadowOpacity: 0.18,
      shadowRadius: 36,
      elevation: 20,
    },
  },
};

export type Theme = typeof theme;

/**
 * Pick a deterministic swatch color for a category name so the same
 * category always renders with the same hue across the app.
 */
export function swatchFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return theme.colors.swatches[hash % theme.colors.swatches.length];
}
