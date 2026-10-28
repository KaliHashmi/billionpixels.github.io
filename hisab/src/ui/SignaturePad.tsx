import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Point } from '../domain/branding';
import { colors, radius } from './theme';

function pathOf(stroke: Point[]) {
  return stroke.length ? `M${stroke.map(([x, y]) => `${x} ${y}`).join(' L ')}${stroke.length === 1 ? 'l0.1 0' : ''}` : '';
}

/** Finger / mouse drawing area. Strokes are reported on every change. */
export function SignaturePad({ strokes, onChange, height = 180 }: { strokes: Point[][]; onChange: (s: Point[][]) => void; height?: number }) {
  const [current, setCurrent] = useState<Point[]>([]);
  // The responder callbacks are created once; refs give them the latest values.
  const live = useRef({ strokes, current: [] as Point[], onChange });
  useEffect(() => {
    live.current.strokes = strokes;
    live.current.onChange = onChange;
  }, [strokes, onChange]);
  // The handlers only read the ref while a finger is down, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const p: Point = [Math.round(e.nativeEvent.locationX), Math.round(e.nativeEvent.locationY)];
        live.current.current = [p];
        setCurrent([p]);
      },
      onPanResponderMove: (e) => {
        const p: Point = [Math.round(e.nativeEvent.locationX), Math.round(e.nativeEvent.locationY)];
        const prev = live.current.current[live.current.current.length - 1];
        if (prev && Math.abs(prev[0] - p[0]) + Math.abs(prev[1] - p[1]) < 2) return;
        live.current.current = [...live.current.current, p];
        setCurrent(live.current.current);
      },
      onPanResponderRelease: () => {
        const { strokes: done, current: stroke, onChange: emit } = live.current;
        if (stroke.length) emit([...done, stroke]);
        live.current.current = [];
        setCurrent([]);
      },
    }),
  );
  return (
    <View style={[st.pad, { height }, Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'crosshair', userSelect: 'none' } as unknown as ViewStyle) : null]} {...pan.panHandlers}>
      <View style={st.line} pointerEvents="none" />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        {[...strokes, current].map((s, i) => (
          <Path key={i} d={pathOf(s)} stroke="#0b2a6b" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      </Svg>
    </View>
  );
}

const st = StyleSheet.create({
  pad: { borderWidth: 1, borderColor: colors.border, borderRadius: radius, backgroundColor: '#fff', overflow: 'hidden' },
  line: { position: 'absolute', left: 24, right: 24, bottom: 40, borderBottomWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
});
