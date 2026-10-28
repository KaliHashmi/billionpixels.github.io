import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBooks, useMoney } from '../../data/store';
import {
  AGED_BUCKETS,
  agedBalance,
  analyticReport,
  balanceSheet,
  cashFlow,
  executiveSummary,
  generalLedger,
  journalAudit,
  partnerLedger,
  profitAndLoss,
  ReportLine,
  trialBalance,
} from '../../domain/reports';
import { AppState } from '../../domain/types';
import { formatDate } from '../../domain/utils';
import { reportHtml, TableReport } from '../../services/documents';
import { sharePdf, shareTextFile, toCsv } from '../../services/files';
import { Button, ButtonRow, Card, Screen } from '../../ui/components';
import { notify } from '../../ui/dialog';
import { PeriodPicker, PeriodValue, usePeriod } from '../../ui/PeriodPicker';
import { colors, space } from '../../ui/theme';

type Row = TableReport['rows'][number] & { onPress?: () => void };
type Built = Omit<TableReport, 'rows'> & { rows: Row[]; note?: string };

const TITLES: Record<string, string> = {
  'profit-loss': 'Profit and Loss',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow Statement',
  'executive-summary': 'Executive Summary',
  'general-ledger': 'General Ledger',
  'trial-balance': 'Trial Balance',
  'journal-audit': 'Journal Audit',
  'partner-ledger': 'Partner Ledger',
  'aged-receivable': 'Aged Receivable',
  'aged-payable': 'Aged Payable',
  analytic: 'Analytic Report',
};

const SINGLE_DATE = new Set(['balance-sheet', 'aged-receivable', 'aged-payable']);

const openLedger = (accountId?: string) => accountId && router.push({ pathname: '/reports/[report]', params: { report: 'general-ledger', accountId } });
const openMove = (id: string) => router.push({ pathname: '/moves/[id]', params: { id } });

function fromLines(lines: ReportLine[]): Row[] {
  return lines.map((l) => ({ cells: [l.label, l.amount], level: l.level, bold: l.bold, onPress: l.accountId ? () => openLedger(l.accountId) : undefined }));
}

function build(report: string, s: AppState, p: PeriodValue, accountId?: string): Built {
  const range = `${formatDate(p.from)} – ${formatDate(p.to)}`;
  const asOf = `As of ${formatDate(p.to)}`;
  switch (report) {
    case 'profit-loss':
      return { title: TITLES[report], subtitle: range, columns: ['', 'Balance'], rows: fromLines(profitAndLoss(s, p.from, p.to).lines) };
    case 'balance-sheet': {
      const bs = balanceSheet(s, p.to);
      return { title: TITLES[report], subtitle: asOf, columns: ['', 'Balance'], rows: fromLines(bs.lines) };
    }
    case 'cash-flow':
      return { title: TITLES[report], subtitle: range, columns: ['', 'Balance'], rows: fromLines(cashFlow(s, p.from, p.to).lines) };
    case 'executive-summary':
      return { title: TITLES[report], subtitle: range, columns: ['', 'Value'], rows: executiveSummary(s, p.from, p.to).map((l) => ({ cells: [l.label, l.bold ? '' : l.amount], bold: l.bold, level: l.level })) };
    case 'trial-balance': {
      const tb = trialBalance(s, p.from, p.to);
      return {
        title: TITLES[report],
        subtitle: range,
        columns: ['Account', 'Initial', 'Debit', 'Credit', 'End'],
        rows: [
          ...tb.rows.map((r) => ({ cells: [`${r.account.code} ${r.account.name}`, r.initial, r.debit, r.credit, r.end], onPress: () => openLedger(r.account.id) })),
          { cells: ['Total', tb.totals.initial, tb.totals.debit, tb.totals.credit, tb.totals.end], bold: true },
        ],
      };
    }
    case 'general-ledger':
    case 'partner-ledger': {
      const groups = report === 'general-ledger' ? generalLedger(s, p.from, p.to, accountId) : partnerLedger(s, p.from, p.to, 'all');
      const rows: Row[] = [];
      for (const g of groups) {
        rows.push({ cells: [g.title, '', '', g.opening], bold: true });
        for (const l of g.lines) {
          rows.push({
            cells: [`${formatDate(l.move.date)} ${l.move.name}${l.line.label ? ` · ${l.line.label}` : ''}`, l.line.debit, l.line.credit, l.balance],
            level: 1,
            onPress: () => openMove(l.move.id),
          });
        }
        rows.push({ cells: [`Total ${g.title}`, g.debit, g.credit, g.closing], bold: true, level: 1 });
      }
      return { title: TITLES[report], subtitle: range, columns: [report === 'general-ledger' ? 'Account' : 'Partner', 'Debit', 'Credit', 'Balance'], rows };
    }
    case 'journal-audit': {
      const rows: Row[] = [];
      for (const g of journalAudit(s, p.from, p.to)) {
        rows.push({ cells: [g.title, g.debit, g.credit], bold: true });
        for (const m of g.moves) {
          const amount = m.lines.reduce((x, l) => x + l.debit, 0);
          rows.push({ cells: [`${formatDate(m.date)} ${m.name}${m.ref ? ` · ${m.ref}` : ''}`, amount, amount], level: 1, onPress: () => openMove(m.id) });
        }
      }
      return { title: TITLES[report], subtitle: range, columns: ['Entry', 'Debit', 'Credit'], rows };
    }
    case 'aged-receivable':
    case 'aged-payable': {
      const r = agedBalance(s, report === 'aged-receivable' ? 'receivable' : 'payable', p.to);
      return {
        title: TITLES[report],
        subtitle: asOf,
        columns: ['Partner', ...AGED_BUCKETS, 'Total'],
        rows: [
          ...r.rows.map((x) => ({
            cells: [x.partner?.name ?? 'Unknown', ...x.buckets, x.total] as (string | number)[],
            onPress: x.partnerId && report === 'aged-receivable' ? () => router.push({ pathname: '/followups/[id]', params: { id: x.partnerId! } }) : undefined,
          })),
          { cells: ['Total', ...r.totals, r.total], bold: true },
        ],
      };
    }
    case 'analytic':
      return {
        title: TITLES[report],
        subtitle: range,
        columns: ['Analytic Account', 'Income', 'Expenses', 'Balance'],
        rows: analyticReport(s, p.from, p.to).map((r) => ({ cells: [r.name, r.income, r.expense, r.balance] })),
        note: s.analyticAccounts.length ? undefined : 'Create analytic accounts (Accounting › Configuration) and set them on invoice lines to track profitability per project, branch or department.',
      };
    default:
      return { title: 'Report', subtitle: '', columns: [], rows: [] };
  }
}

export default function ReportScreen() {
  const { report, accountId } = useLocalSearchParams<{ report: string; accountId?: string }>();
  // Remount per report so each one starts with its own default period.
  return <ReportView key={report} report={report} accountId={accountId || undefined} />;
}

function ReportView({ report, accountId }: { report: string; accountId?: string }) {
  const s = useBooks();
  const money = useMoney();
  const single = SINGLE_DATE.has(report);
  const [period, setPeriod] = usePeriod(s.settings.fiscalYearLastMonth, 'this_fy', single);
  const data = useMemo(() => build(report, s, period, accountId), [report, s, period, accountId]);
  const wide = data.columns.length > 3;
  const fileBase = `${data.title.replace(/\s+/g, '-')}-${period.to}`;

  const exportCsv = () =>
    shareTextFile(`${fileBase}.csv`, toCsv([data.columns, ...data.rows.map((r) => r.cells)]), 'text/csv').catch((e) => notify('Export failed', String(e)));
  const exportPdf = () => sharePdf(reportHtml(s, data), fileBase).catch((e) => notify('Export failed', String(e)));
  const fmt = (c: string | number) => (typeof c === 'number' ? money(c, false) : c);
  const neg = (c: string | number) => (typeof c === 'number' && c < 0 ? { color: colors.danger } : null);

  // Two-column statements render as a classic table; wider ones stack the figures under each label.
  const table = (
    <View>
      {!wide && (
        <View style={[st.row, st.head]}>
          {data.columns.map((c, i) => (
            <Text key={i} style={[st.cell, i === 0 ? st.first : st.num, st.headText]}>
              {c}
            </Text>
          ))}
        </View>
      )}
      {data.rows.map((r, idx) => (
        <Pressable key={idx} onPress={r.onPress} disabled={!r.onPress} style={({ pressed }) => [wide ? st.stacked : st.row, r.bold && st.boldRow, pressed && { opacity: 0.6 }]}>
          <Text
            numberOfLines={2}
            style={[st.cell, st.first, { paddingLeft: 4 + (r.level ?? 0) * 12 }, r.bold && { fontWeight: '700' }, r.onPress ? { color: colors.primary } : null, !wide && neg(r.cells[0])]}
          >
            {fmt(r.cells[0])}
          </Text>
          {wide ? (
            <View style={[st.figures, { paddingLeft: 4 + (r.level ?? 0) * 12 }]}>
              {r.cells.slice(1).map((c, i) =>
                c === '' || (c === 0 && i < r.cells.length - 2) ? null : (
                  <Text key={i} style={st.figure}>
                    <Text style={st.figureLabel}>{data.columns[i + 1]} </Text>
                    <Text style={[r.bold && { fontWeight: '700' }, neg(c)]}>{fmt(c)}</Text>
                  </Text>
                ),
              )}
            </View>
          ) : (
            r.cells.slice(1).map((c, i) => (
              <Text key={i} numberOfLines={1} style={[st.cell, st.num, r.bold && { fontWeight: '700' }, neg(c)]}>
                {fmt(c)}
              </Text>
            ))
          )}
        </Pressable>
      ))}
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: data.title }} />
      <PeriodPicker value={period} onChange={setPeriod} fyLastMonth={s.settings.fiscalYearLastMonth} single={single} />
      <Card style={{ padding: space.md }}>
        <Text style={{ color: colors.muted, marginBottom: space.sm }}>
          {data.subtitle} · {s.settings.currency}
          {accountId ? ' · filtered on one account' : ''}
        </Text>
        {data.rows.length === 0 ? <Text style={{ color: colors.muted }}>No data for this period.</Text> : table}
        {data.note && <Text style={{ color: colors.muted, marginTop: space.md }}>{data.note}</Text>}
      </Card>
      <ButtonRow>
        <Button small variant="secondary" title="PDF" icon="document-outline" onPress={exportPdf} />
        <Button small variant="secondary" title="CSV / Excel" icon="grid-outline" onPress={exportCsv} />
        {accountId && <Button small variant="ghost" title="All accounts" onPress={() => router.setParams({ accountId: '' })} />}
      </ButtonRow>
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  head: { borderBottomWidth: 1, borderBottomColor: colors.text },
  headText: { fontWeight: '700', color: colors.muted, fontSize: 12, textTransform: 'uppercase' },
  boldRow: { backgroundColor: '#FAFAFB' },
  cell: { fontSize: 13, color: colors.text, paddingHorizontal: 4 },
  first: { flex: 1 },
  num: { textAlign: 'right', minWidth: 90 },
  stacked: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  figures: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 3 },
  figure: { fontSize: 13, color: colors.text },
  figureLabel: { fontSize: 11, color: colors.muted, textTransform: 'uppercase' },
});
