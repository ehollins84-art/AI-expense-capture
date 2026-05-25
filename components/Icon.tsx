import React from 'react';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

export type IconName =
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'plus'
  | 'camera'
  | 'image'
  | 'edit'
  | 'check'
  | 'x'
  | 'trash'
  | 'more'
  | 'calendar'
  | 'tag'
  | 'folder'
  | 'sparkle'
  | 'arrow-up-right'
  | 'arrow-down-right';

const FEATHER: Partial<Record<IconName, React.ComponentProps<typeof Feather>['name']>> = {
  settings: 'settings',
  'chevron-left': 'chevron-left',
  'chevron-right': 'chevron-right',
  plus: 'plus',
  camera: 'camera',
  image: 'image',
  edit: 'edit-2',
  check: 'check',
  x: 'x',
  trash: 'trash-2',
  more: 'more-horizontal',
  calendar: 'calendar',
  tag: 'tag',
  folder: 'folder',
  'arrow-up-right': 'arrow-up-right',
  'arrow-down-right': 'arrow-down-right',
};

export function Icon({
  name,
  size = 20,
  color = theme.colors.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  if (name === 'sparkle') {
    return (
      <MaterialCommunityIcons
        name="auto-fix"
        size={size}
        color={color}
      />
    );
  }
  const fname = FEATHER[name];
  if (fname) {
    return <Feather name={fname} size={size} color={color} />;
  }
  return null;
}
