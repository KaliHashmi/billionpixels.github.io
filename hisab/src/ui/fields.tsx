import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { FlatList, KeyboardTypeOptions, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDays, isValidISODate, today } from '../domain/utils';
import { useT } from '../i18n';
import { SearchBar } from './components';
import { colors, space } from './theme';

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={s.label}>
      {label}
      {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
    </Text>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboardType,
  required,
  editable = true,
  autoCapitalize,
  secure,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  required?: boolean;
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Password entry (hidden text, no autocorrect). */
  secure?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <View style={s.field}>
      <FieldLabel label={label} required={required} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        editable={editable}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secure}
        autoCorrect={secure ? false : undefined}
        textContentType={secure ? 'password' : undefined}
        onSubmitEditing={onSubmit}
        style={[s.input, multiline && { minHeight: 70, textAlignVertical: 'top' }, !editable && s.readonly]}
      />
    </View>
  );
}

/** Numeric input that keeps the user's text while typing. */
export function NumberField({
  label,
  value,
  onChange,
  required,
  editable = true,
  compact,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  required?: boolean;
  editable?: boolean;
  compact?: boolean;
}) {
  const [text, setText] = useState(String(value ?? 0));
  const [prev, setPrev] = useState(value);
  // Follow outside changes without clobbering what the user is typing ("1." stays "1.").
  if (value !== prev) {
    setPrev(value);
    if (Number(text.replace(',', '.')) !== value) setText(String(value ?? 0));
  }
  return (
    <View style={[s.field, compact && { flex: 1 }]}>
      <FieldLabel label={label} required={required} />
      <TextInput
        value={text}
        editable={editable}
        onChangeText={(t) => {
          setText(t);
          const n = Number(t.replace(',', '.'));
          if (!Number.isNaN(n)) onChange(n);
        }}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={[s.input, !editable && s.readonly]}
      />
    </View>
  );
}

export function DateField({ label, value, onChange, required, editable = true }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; editable?: boolean }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  const valid = isValidISODate(text);
  const set = (v: string) => {
    setText(v);
    if (isValidISODate(v)) onChange(v);
  };
  return (
    <View style={s.field}>
      <FieldLabel label={label} required={required} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TextInput
          value={text}
          editable={editable}
          onChangeText={set}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          style={[s.input, { flex: 1, minWidth: 0 }, !valid && { borderColor: colors.danger }, !editable && s.readonly]}
          maxLength={10}
        />
        {editable && (
          <>
            <SmallIcon icon="remove" onPress={() => set(addDays(valid ? text : today(), -1))} />
            <SmallIcon icon="today-outline" onPress={() => set(today())} />
            <SmallIcon icon="add" onPress={() => set(addDays(valid ? text : today(), 1))} />
          </>
        )}
      </View>
    </View>
  );
}

function SmallIcon({ icon, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={18} color={colors.primary} />
    </Pressable>
  );
}

export function SwitchField({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={[s.field, s.switchRow]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.label, { marginBottom: 0 }]}>{label}</Text>
        {!!hint && <Text style={s.hint}>{hint}</Text>}
      </View>
      {/* The web switch positions its knob from the left, so in Arabic it would sit outside the track. */}
      <View style={Platform.OS === 'web' ? { direction: 'ltr' } : undefined}>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
      </View>
    </View>
  );
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

function OptionModal({
  visible,
  title,
  options,
  selected,
  multiple,
  onClose,
  onSelect,
  allowClear,
  onCreate,
}: {
  visible: boolean;
  title: string;
  options: Option[];
  selected: string[];
  multiple?: boolean;
  onClose: () => void;
  onSelect: (values: string[]) => void;
  allowClear?: boolean;
  onCreate?: (text: string) => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(selected);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSel(selected);
      setQ('');
    }
  }
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.label.toLowerCase().includes(t) || o.hint?.toLowerCase().includes(t)) : options;
  }, [q, options]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={s.modalAction}>{t('Cancel')}</Text>
          </Pressable>
          <Text style={s.modalTitle} numberOfLines={1}>
            {title}
          </Text>
          {multiple ? (
            <Pressable onPress={() => onSelect(sel)} hitSlop={10}>
              <Text style={[s.modalAction, { fontWeight: '700' }]}>{t('Done')}</Text>
            </Pressable>
          ) : allowClear ? (
            <Pressable onPress={() => onSelect([])} hitSlop={10}>
              <Text style={s.modalAction}>{t('Clear')}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 50 }} />
          )}
        </View>
        <View style={{ padding: space.md }}>
          <SearchBar value={q} onChangeText={setQ} />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            onCreate && q.trim() ? (
              <Pressable style={s.option} onPress={() => onCreate(q.trim())}>
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={[s.optionText, { color: colors.primary, marginStart: 8 }]}>{t('Create "{name}"', { name: q.trim() })}</Text>
              </Pressable>
            ) : undefined
          }
          renderItem={({ item }) => {
            const active = sel.includes(item.value);
            return (
              <Pressable
                style={({ pressed }) => [s.option, pressed && { opacity: 0.6 }]}
                onPress={() => {
                  if (multiple) setSel(active ? sel.filter((v) => v !== item.value) : [...sel, item.value]);
                  else onSelect([item.value]);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.optionText}>{item.label}</Text>
                  {!!item.hint && <Text style={s.hint}>{item.hint}</Text>}
                </View>
                {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  required,
  placeholder,
  editable = true,
  allowClear = true,
  onCreate,
}: {
  label: string;
  value?: string;
  options: Option[];
  onChange: (v: string | undefined) => void;
  required?: boolean;
  placeholder?: string;
  editable?: boolean;
  allowClear?: boolean;
  /** Quick-create a record from the search text; must return the new id. */
  onCreate?: (text: string) => string | undefined;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={s.field}>
      <FieldLabel label={label} required={required} />
      <Pressable disabled={!editable} onPress={() => setOpen(true)} style={[s.input, s.select, !editable && s.readonly]}>
        <Text style={{ color: current ? colors.text : colors.muted, flex: 1, fontSize: 15 }} numberOfLines={1}>
          {current?.label ?? placeholder ?? t('Select…')}
        </Text>
        {editable && <Ionicons name="chevron-down" size={18} color={colors.muted} />}
      </Pressable>
      <OptionModal
        visible={open}
        title={label}
        options={options}
        selected={value ? [value] : []}
        allowClear={allowClear && !required}
        onClose={() => setOpen(false)}
        onSelect={(v) => {
          onChange(v[0]);
          setOpen(false);
        }}
        onCreate={
          onCreate
            ? (text) => {
                const id = onCreate(text);
                if (id) onChange(id);
                setOpen(false);
              }
            : undefined
        }
      />
    </View>
  );
}

export function MultiSelectField({ label, value, options, onChange, editable = true }: { label: string; value: string[]; options: Option[]; onChange: (v: string[]) => void; editable?: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const labels = options.filter((o) => value.includes(o.value)).map((o) => o.label);
  return (
    <View style={s.field}>
      <FieldLabel label={label} />
      <Pressable disabled={!editable} onPress={() => setOpen(true)} style={[s.input, s.select, !editable && s.readonly]}>
        <Text style={{ color: labels.length ? colors.text : colors.muted, flex: 1, fontSize: 15 }} numberOfLines={2}>
          {labels.length ? labels.join('، ') : t('None')}
        </Text>
        {editable && <Ionicons name="chevron-down" size={18} color={colors.muted} />}
      </Pressable>
      <OptionModal
        visible={open}
        title={label}
        options={options}
        selected={value}
        multiple
        onClose={() => setOpen(false)}
        onSelect={(v) => {
          onChange(v);
          setOpen(false);
        }}
      />
    </View>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={s.field}>
      {label && <FieldLabel label={label} />}
      <View style={s.segmented}>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segment, o.value === value && s.segmentActive]}>
            <Text style={[s.segmentText, o.value === value && { color: '#fff', fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  field: { marginBottom: space.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  readonly: { backgroundColor: colors.bg },
  select: { flexDirection: 'row', alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  iconBtn: { width: 34, height: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: '#fff',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'center' },
  modalAction: { fontSize: 16, color: colors.primary },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: { fontSize: 15, color: colors.text },
  segmented: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 13, color: colors.text },
});
