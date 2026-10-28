import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, space } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, contentStyle, ...rest }: ScrollViewProps & { children: React.ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Row({ label, value, bold, valueStyle, onPress }: { label: string; value?: React.ReactNode; bold?: boolean; valueStyle?: StyleProp<TextStyle>; onPress?: () => void }) {
  const content = (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[styles.rowValue, bold && styles.bold, valueStyle]} numberOfLines={2}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function ListItem({
  title,
  subtitle,
  right,
  rightSub,
  badge,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  rightSub?: string;
  badge?: React.ReactNode;
  icon?: IconName;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.listItem, pressed && onPress && styles.pressed]}>
      {icon && <Ionicons name={icon} size={22} color={colors.primary} style={{ marginRight: space.md }} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.listSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: space.sm }}>
        {!!right && <Text style={styles.listRight}>{right}</Text>}
        {!!rightSub && <Text style={styles.listSubtitle}>{rightSub}</Text>}
        {badge}
      </View>
      {onPress && !right && !badge && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </Pressable>
  );
}

export function MenuItem({ icon, title, subtitle, onPress, count }: { icon: IconName; title: string; subtitle?: string; onPress: () => void; count?: number }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.listItem, pressed && styles.pressed]}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.listSubtitle}>{subtitle}</Text>}
      </View>
      {!!count && (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const BADGE_COLORS: Record<string, string> = {
  draft: colors.draft,
  posted: colors.accent,
  cancel: colors.danger,
  not_paid: colors.warning,
  partial: colors.info,
  in_payment: colors.primary,
  paid: colors.success,
  reversed: colors.muted,
  overdue: colors.danger,
  reconciled: colors.success,
  to_reconcile: colors.warning,
  running: colors.accent,
  closed: colors.success,
};

export function Badge({ label, tone }: { label: string; tone: string }) {
  const c = BADGE_COLORS[tone] ?? colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: c + '22', borderColor: c }]}>
      <Text style={[styles.badgeText, { color: c }]}>{label}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : variant === 'secondary' ? '#fff' : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, borderColor: variant === 'ghost' ? 'transparent' : variant === 'secondary' ? colors.border : bg },
        pressed && styles.pressed,
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={small ? 16 : 18} color={fg} style={{ marginRight: 6 }} />}
      <Text style={[styles.buttonText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.buttonRow}>{children}</View>;
}

export function Fab({ onPress, icon = 'add' }: { onPress: () => void; icon?: IconName }) {
  return (
    <Pressable accessibilityLabel="New" onPress={onPress} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
      <Ionicons name={icon} size={28} color="#fff" />
    </Pressable>
  );
}

export function EmptyState({ icon = 'document-text-outline', title, message }: { icon?: IconName; title: string; message?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={colors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!message && <Text style={styles.emptyMessage}>{message}</Text>}
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.empty, { flex: 1 }]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder = 'Search…' }: { value: string; onChangeText: (s: string) => void; placeholder?: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {o.label}
              {o.count !== undefined ? ` (${o.count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Kpi({ label, value, tone, onPress }: { label: string; value: string; tone?: 'danger' | 'success' | 'default'; onPress?: () => void }) {
  return (
    <Card style={styles.kpi} onPress={onPress}>
      <Text style={styles.kpiLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.kpiValue, tone === 'danger' && { color: colors.danger }, tone === 'success' && { color: colors.success }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </Card>
  );
}

export function BarChart({ series, height = 120 }: { series: { label: string; values: { value: number; color: string }[] }[]; height?: number }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => Math.abs(v.value))));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: height + 20, gap: space.sm }}>
      {series.map((s) => (
        <View key={s.label} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 2 }}>
            {s.values.map((v, i) => (
              <View key={i} style={{ width: 10, height: Math.max(2, (Math.abs(v.value) / max) * height), backgroundColor: v.color, borderRadius: 3 }} />
            ))}
          </View>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.sm }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: i.color }} />
          <Text style={{ fontSize: 12, color: colors.muted }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: space.lg, paddingBottom: 96, gap: space.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, gap: space.md },
  rowLabel: { color: colors.muted, fontSize: 14, flexShrink: 1 },
  rowValue: { color: colors.text, fontSize: 14, textAlign: 'right', flexShrink: 1 },
  bold: { fontWeight: '700', color: colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.sm },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  listSubtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  listRight: { fontSize: 15, fontWeight: '600', color: colors.text },
  menuIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: space.md },
  countPill: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: space.sm },
  countText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1 },
  buttonSmall: { paddingVertical: 7, paddingHorizontal: 12 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: space.sm },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  emptyMessage: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.text },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  kpi: { flex: 1, minWidth: '45%', padding: space.md },
  kpiLabel: { fontSize: 12, color: colors.muted },
  kpiValue: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 4 },
});
