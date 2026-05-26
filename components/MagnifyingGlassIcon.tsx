import React from 'react';
import { View } from 'react-native';

export function MagnifyingGlassIcon({
  size = 22,
  color = '#1B1B1B',
  strokeWidth,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const stroke = strokeWidth ?? Math.max(1.8, size * 0.1);
  const ring = size * 0.7;
  const handleLen = size * 0.35;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: stroke,
          height: handleLen,
          borderRadius: stroke / 2,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}
