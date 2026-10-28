import { useState } from 'react';
import { View } from 'react-native';
import { addDays, addMonths, endOfMonth, fiscalYear, startOfMonth, today } from '../domain/utils';
import { Chips } from './components';
import { DateField } from './fields';
import { space } from './theme';

export type PresetKey = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_fy' | 'last_fy' | 'custom';

export interface PeriodValue {
  from: string;
  to: string;
  preset: PresetKey;
}

function quarterStart(d: string) {
  const m = Number(d.slice(5, 7));
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${d.slice(0, 4)}-${String(qm).padStart(2, '0')}-01`;
}

export function computePeriod(preset: PresetKey, fyLastMonth: number, ref = today()): { from: string; to: string } {
  switch (preset) {
    case 'this_month':
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    case 'last_month': {
      const d = addMonths(startOfMonth(ref), -1);
      return { from: d, to: endOfMonth(d) };
    }
    case 'this_quarter': {
      const q = quarterStart(ref);
      return { from: q, to: endOfMonth(addMonths(q, 2)) };
    }
    case 'last_quarter': {
      const q = addMonths(quarterStart(ref), -3);
      return { from: q, to: endOfMonth(addMonths(q, 2)) };
    }
    case 'last_fy': {
      const prev = fiscalYear(addDays(fiscalYear(ref, fyLastMonth).start, -1), fyLastMonth);
      return { from: prev.start, to: prev.end };
    }
    default: {
      const fy = fiscalYear(ref, fyLastMonth);
      return { from: fy.start, to: fy.end };
    }
  }
}

const PRESETS: { value: PresetKey; label: string }[] = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_fy', label: 'This Fiscal Year' },
  { value: 'last_fy', label: 'Last Fiscal Year' },
  { value: 'custom', label: 'Custom' },
];

/** `asOfToday` starts point-in-time reports (balance sheet, aged balances) at today's date. */
export function usePeriod(fyLastMonth: number, initial: PresetKey = 'this_fy', asOfToday = false) {
  const [value, setValue] = useState<PeriodValue>(() =>
    asOfToday ? { from: computePeriod('this_fy', fyLastMonth).from, to: today(), preset: 'custom' } : { ...computePeriod(initial, fyLastMonth), preset: initial },
  );
  return [value, setValue] as const;
}

export function PeriodPicker({ value, onChange, fyLastMonth, single }: { value: PeriodValue; onChange: (v: PeriodValue) => void; fyLastMonth: number; single?: boolean }) {
  return (
    <View style={{ gap: space.sm }}>
      <Chips
        options={PRESETS}
        value={value.preset}
        onChange={(preset) => onChange(preset === 'custom' ? { ...value, preset } : { ...computePeriod(preset, fyLastMonth), preset })}
      />
      {value.preset === 'custom' && (
        <View style={{ flexDirection: single ? 'column' : 'row', gap: space.sm }}>
          {!single && (
            <View style={{ flex: 1 }}>
              <DateField label="From" value={value.from} onChange={(from) => onChange({ ...value, from })} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <DateField label={single ? 'As of' : 'To'} value={value.to} onChange={(to) => onChange({ ...value, to })} />
          </View>
        </View>
      )}
    </View>
  );
}
