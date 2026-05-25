import React from 'react';
import { View } from 'react-native';

export function CameraIcon({
  size = 26,
  color = '#fff',
}: {
  size?: number;
  color?: string;
}) {
  const w = size;
  const h = size * 0.78;
  const bodyRadius = size * 0.18;
  const lens = size * 0.42;
  const notchW = size * 0.32;
  const notchH = size * 0.18;
  const stroke = Math.max(1.6, size * 0.08);

  return (
    <View
      style={{
        width: w,
        height: h + notchH * 0.55,
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: notchW,
          height: notchH,
          backgroundColor: 'transparent',
          borderTopLeftRadius: notchH * 0.4,
          borderTopRightRadius: notchH * 0.4,
          borderWidth: stroke,
          borderBottomWidth: 0,
          borderColor: color,
        }}
      />
      <View
        style={{
          width: w,
          height: h,
          borderRadius: bodyRadius,
          borderWidth: stroke,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: lens,
            height: lens,
            borderRadius: lens / 2,
            borderWidth: stroke,
            borderColor: color,
          }}
        />
      </View>
    </View>
  );
}
