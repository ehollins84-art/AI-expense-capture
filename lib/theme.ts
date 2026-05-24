export const theme = {
  colors: {
    bg: '#FAFAF7',
    surface: '#FFFFFF',
    surfaceAlt: '#F4F2EC',
    border: '#ECE9E1',
    text: '#1B1B1B',
    textMuted: '#6B6B6B',
    textSubtle: '#9A968B',
    accent: '#C6633A',
    accentSoft: '#F4E3D7',
    success: '#3F7D5C',
    danger: '#B5443A',
  },
  radius: {
    sm: 8,
    md: 14,
    lg: 22,
    xl: 28,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  type: {
    display: { fontSize: 34, fontWeight: '600' as const, letterSpacing: -0.5 },
    title: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.2 },
    body: { fontSize: 16, fontWeight: '400' as const },
    bodyStrong: { fontSize: 16, fontWeight: '600' as const },
    label: { fontSize: 13, fontWeight: '500' as const, letterSpacing: 0.2 },
    mono: { fontSize: 15, fontWeight: '500' as const },
  },
};

export type Theme = typeof theme;
