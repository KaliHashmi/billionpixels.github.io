import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBooks, useMoney } from '../../data/store';
import { BudgetRow, bankReconciliation, budgetVsActual, cashPosition, chequeRegister, expenseReport, partnerOutstanding, payrollReport, pendingDocuments, unallocated, vatReturn } from '../../domain/management';
import { monthsInPeriod } from '../../domain/operations';
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
import { Account, AppState } from '../../domain/types';
import { addDays, addMonths, daysBetween, endOfMonth, round, today } from '../../domain/utils';
import { journalOptions } from '../../features/entities';
import { useT } from '../../i18n';
import { reportHtml, TableReport } from '../../services/documents';
import { sharePdf, shareTextFile, toCsv } from '../../services/files';
import { Button, ButtonRow, Card, Screen } from '../../ui/components';
import { notify } from '../../ui/dialog';
import { SelectField } from '../../ui/fields';
import { PeriodPicker, PeriodValue, PresetKey, usePeriod } from '../../ui/PeriodPicker';
import { colors, space } from '../../ui/theme';

type Row = TableReport['rows'][number] & { onPress?: () => void };
type Built = Omit<TableReport, 'rows'> & { rows: Row[]; note?: string };
type Tr = (key: string, params?: Record<string, string | number>) => string;

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
  'customer-outstanding': 'Customer Outstanding',
  'supplier-outstanding': 'Supplier Outstanding',
  'cash-position': 'Bank & Cash Balance',
  pending: 'Pending Collections & Payments',
  unallocated: 'Unallocated Receipts & Payments',
  cheques: 'Cheques Issued, Received & Pending',
  'bank-reconciliation': 'Bank Reconciliation',
  vat: 'VAT Report',
  expenses: 'Expense Report',
  budget: 'Budget vs. Actual',
  payroll: 'Payroll Report',
};

/** Point-in-time reports: one "as of" date instead of a period. */
const SINGLE_DATE = new Set(['balance-sheet', 'aged-receivable', 'aged-payable', 'customer-outstanding', 'supplier-outstanding', 'cash-position', 'unallocated', 'bank-reconciliation']);

const openLedger = (accountId?: string) => accountId && router.push({ pathname: '/reports/[report]', params: { report: 'general-ledger', accountId } });
const openMove = (id: string) => router.push({ pathname: '/moves/[id]', params: { id } });
const openPayment = (id: string) => router.push({ pathname: '/payments/[id]', params: { id } });

function fromLines(lines: ReportLine[], t: Tr, s: AppState): Row[] {
  const accounts = new Map(s.accounts.map((a) => [a.id, a]));
  return lines.map((l) => {
    const a = l.accountId ? accounts.get(l.accountId) : undefined;
    return { cells: [a ? `${a.code} ${t(a.name)}` : t(l.label), l.amount], level: l.level, bold: l.bold, onPress: a ? () => openLedger(a.id) : undefined };
  });
}

/** Same-length period just before [from, to] (whole months when the period is month-aligned). */
function previousPeriod(from: string, to: string): [string, string] {
  if (from.endsWith('-01') && endOfMonth(to) === to) {
    const months = monthsInPeriod(from, to);
    const pf = addMonths(from, -months);
    return [pf, endOfMonth(addMonths(pf, months - 1))];
  }
  const len = daysBetween(from, to);
  const pt = addDays(from, -1);
  return [addDays(pt, -len), pt];
}

interface Extra {
  accountId?: string;
  journalId?: string;
  budgetId?: string;
}

function build(report: string, s: AppState, p: PeriodValue, x: Extra, t: Tr, fmtDate: (d?: string) => string): Built {
  const range = `${fmtDate(p.from)} – ${fmtDate(p.to)}`;
  const asOf = `${t('As of')} ${fmtDate(p.to)}`;
  const title = t(TITLES[report] ?? 'Report');
  const accName = (a: Account) => `${a.code} ${t(a.name)}`;
  switch (report) {
    case 'profit-loss':
      return { title, subtitle: range, columns: ['', t('Balance')], rows: fromLines(profitAndLoss(s, p.from, p.to).lines, t, s) };
    case 'balance-sheet':
      return { title, subtitle: asOf, columns: ['', t('Balance')], rows: fromLines(balanceSheet(s, p.to).lines, t, s) };
    case 'cash-flow':
      return { title, subtitle: range, columns: ['', t('Amount')], rows: fromLines(cashFlow(s, p.from, p.to).lines, t, s) };
    case 'executive-summary':
      return { title, subtitle: range, columns: ['', t('Value')], rows: executiveSummary(s, p.from, p.to).map((l) => ({ cells: [t(l.label), l.bold ? '' : l.amount], bold: l.bold, level: l.level })) };
    case 'trial-balance': {
      const tb = trialBalance(s, p.from, p.to);
      return {
        title,
        subtitle: range,
        columns: [t('Account'), t('Initial'), t('Debit'), t('Credit'), t('End')],
        rows: [
          ...tb.rows.map((r) => ({ cells: [accName(r.account), r.initial, r.debit, r.credit, r.end], onPress: () => openLedger(r.account.id) })),
          { cells: [t('Total'), tb.totals.initial, tb.totals.debit, tb.totals.credit, tb.totals.end], bold: true },
        ],
      };
    }
    case 'general-ledger':
    case 'partner-ledger': {
      const groups = report === 'general-ledger' ? generalLedger(s, p.from, p.to, x.accountId) : partnerLedger(s, p.from, p.to, 'all');
      const accounts = new Map(s.accounts.map((a) => [a.id, a]));
      const rows: Row[] = [];
      for (const g of groups) {
        const gTitle = report === 'general-ledger' && accounts.get(g.key) ? accName(accounts.get(g.key)!) : g.title;
        rows.push({ cells: [gTitle, '', '', g.opening], bold: true });
        for (const l of g.lines) {
          rows.push({ cells: [`${fmtDate(l.move.date)} ${l.move.name}${l.line.label ? ` · ${l.line.label}` : ''}`, l.line.debit, l.line.credit, l.balance], level: 1, onPress: () => openMove(l.move.id) });
        }
        rows.push({ cells: [`${t('Total')} ${gTitle}`, g.debit, g.credit, g.closing], bold: true, level: 1 });
      }
      return { title, subtitle: range, columns: [t(report === 'general-ledger' ? 'Account' : 'Partner'), t('Debit'), t('Credit'), t('Balance')], rows };
    }
    case 'journal-audit': {
      const rows: Row[] = [];
      for (const g of journalAudit(s, p.from, p.to)) {
        rows.push({ cells: [t(g.title.replace(/ \(.*\)$/, '')), g.debit, g.credit], bold: true });
        for (const m of g.moves) {
          const amount = m.lines.reduce((a, l) => a + l.debit, 0);
          rows.push({ cells: [`${fmtDate(m.date)} ${m.name}${m.ref ? ` · ${m.ref}` : ''}`, amount, amount], level: 1, onPress: () => openMove(m.id) });
        }
      }
      return { title, subtitle: range, columns: [t('Entry'), t('Debit'), t('Credit')], rows };
    }
    case 'aged-receivable':
    case 'aged-payable': {
      const r = agedBalance(s, report === 'aged-receivable' ? 'receivable' : 'payable', p.to);
      return {
        title,
        subtitle: asOf,
        columns: [t('Partner'), ...AGED_BUCKETS.map((b) => t(b)), t('Total')],
        rows: [
          ...r.rows.map((y) => ({
            cells: [y.partner?.name ?? t('Unknown'), ...y.buckets, y.total] as (string | number)[],
            onPress: y.partnerId && report === 'aged-receivable' ? () => router.push({ pathname: '/followups/[id]', params: { id: y.partnerId! } }) : undefined,
          })),
          { cells: [t('Total'), ...r.totals, r.total], bold: true },
        ],
      };
    }
    case 'customer-outstanding':
    case 'supplier-outstanding': {
      const kind = report === 'customer-outstanding' ? 'receivable' : 'payable';
      const r = partnerOutstanding(s, kind, p.to);
      return {
        title,
        subtitle: asOf,
        columns: [t(kind === 'receivable' ? 'Customer' : 'Vendor'), t('Not due'), t('Overdue'), t('Total')],
        rows: [
          ...r.rows.map((y) => ({
            cells: [`${y.partner?.name ?? t('Unknown')}${y.oldestDays > 0 ? ` (${t('{days} days late', { days: y.oldestDays })})` : ''}`, y.notDue, y.overdue, y.total] as (string | number)[],
            onPress: y.partnerId ? () => router.push({ pathname: '/moves', params: { type: kind === 'receivable' ? 'out_invoice' : 'in_invoice', partnerId: y.partnerId, filter: 'open' } }) : undefined,
          })),
          { cells: [t('Total'), round(r.total - r.overdue, s.settings.decimals), r.overdue, r.total], bold: true },
        ],
      };
    }
    case 'cash-position': {
      const c = cashPosition(s, p.to);
      return {
        title,
        subtitle: asOf,
        columns: ['', t('Balance')],
        rows: [
          { cells: [t('Bank and cash balances (books)'), c.totalBooks], bold: true },
          ...c.journals.map((j) => ({
            cells: [`${t(j.journal.name)}${j.journal.type === 'bank' && j.unreconciledCount ? ` · ${t('{count} to reconcile', { count: j.unreconciledCount })}` : ''}`, j.balance] as (string | number)[],
            level: 2 as const,
            onPress: () => router.push({ pathname: '/cashbook', params: { journalId: j.journal.id } }),
          })),
          { cells: [t('Money in transit'), c.totalInTransit], bold: true },
          ...c.inTransit.map((i) => ({ cells: [t(i.label), i.amount] as (string | number)[], level: 2 as const, onPress: () => openLedger(i.accountId) })),
          { cells: [t('Expected bank and cash after clearing'), round(c.totalBooks + c.totalInTransit, s.settings.decimals)], bold: true },
        ],
      };
    }
    case 'pending': {
      const asOfToday = today();
      const rows: Row[] = [];
      for (const kind of ['customer', 'supplier'] as const) {
        const docs = pendingDocuments(s, kind, asOfToday, p.to);
        rows.push({ cells: [t(kind === 'customer' ? 'Pending customer collections' : 'Pending supplier payments'), round(docs.reduce((a, d) => a + d.residual, 0), s.settings.decimals)], bold: true });
        for (const d of docs) {
          rows.push({
            cells: [`${d.move.name} · ${d.partner?.name ?? ''} · ${t('Due')} ${fmtDate(d.dueDate)}${d.daysLate ? ` (${t('{days} days late', { days: d.daysLate })})` : ''}`, d.residual],
            level: 1,
            onPress: () => openMove(d.move.id),
          });
        }
      }
      return { title, subtitle: `${t('Overdue and due until')} ${fmtDate(p.to)}`, columns: ['', t('Amount Due')], rows };
    }
    case 'unallocated': {
      const list = unallocated(s);
      const rows: Row[] = [];
      for (const kind of ['receipt', 'payment'] as const) {
        const items = list.filter((u) => u.kind === kind);
        rows.push({ cells: [t(kind === 'receipt' ? 'Customer receipts not allocated to invoices' : 'Vendor payments not allocated to bills'), round(items.reduce((a, u) => a + u.amount, 0), s.settings.decimals)], bold: true });
        for (const u of items) {
          rows.push({
            cells: [`${u.move.name} · ${u.partner?.name ?? ''} · ${fmtDate(u.move.date)}`, u.amount],
            level: 1,
            onPress: () => (u.payment ? openPayment(u.payment.id) : openMove(u.move.id)),
          });
        }
      }
      return { title, subtitle: asOf, columns: ['', t('Amount')], rows, note: t('Open the related invoice and use "Outstanding credits" to allocate a receipt.') };
    }
    case 'cheques': {
      const list = chequeRegister(s);
      const inPeriod = (c: (typeof list)[number]) => c.status === 'pending' || ((c.payment.chequeDate ?? c.payment.date) >= p.from && (c.payment.chequeDate ?? c.payment.date) <= p.to);
      const rows: Row[] = [];
      const labels = { pending: 'Pending Clearance', cleared: 'Cleared', bounced: 'Bounced', cancelled: 'Cancelled' };
      for (const dir of ['received', 'issued'] as const) {
        const items = list.filter((c) => c.direction === dir && inPeriod(c));
        const pending = items.filter((c) => c.status === 'pending');
        rows.push({ cells: [t(dir === 'received' ? 'Cheques received' : 'Cheques issued'), round(items.reduce((a, c) => a + c.payment.amount, 0), s.settings.decimals)], bold: true });
        rows.push({ cells: [t('of which pending clearance'), round(pending.reduce((a, c) => a + c.payment.amount, 0), s.settings.decimals)], level: 1, bold: true });
        for (const c of items) {
          rows.push({
            cells: [`#${c.payment.chequeNumber ?? ''} · ${c.partner?.name ?? ''} · ${fmtDate(c.payment.chequeDate)} · ${t(labels[c.status])}`, c.payment.amount],
            level: 2,
            onPress: () => openPayment(c.payment.id),
          });
        }
      }
      return { title, subtitle: `${range} · ${t('plus all pending cheques')}`, columns: ['', t('Amount')], rows };
    }
    case 'bank-reconciliation': {
      const journal = s.journals.find((j) => j.id === x.journalId) ?? s.journals.find((j) => j.type === 'bank' && j.active);
      if (!journal) return { title, subtitle: asOf, columns: [], rows: [] };
      const r = bankReconciliation(s, journal.id, p.to);
      const items = (label: string, list: { date: string; label: string; amount: number }[], sign: 1 | -1): Row[] => [
        { cells: [t(label), sign * list.reduce((a, i) => a + i.amount, 0)], level: 1, bold: true },
        ...list.map((i) => ({ cells: [`${fmtDate(i.date)} · ${i.label}`, sign * i.amount] as (string | number)[], level: 2 as const })),
      ];
      return {
        title: `${title} · ${t(journal.name)}`,
        subtitle: asOf,
        columns: ['', t('Amount')],
        rows: [
          { cells: [t('Balance as per bank statement'), r.statementBalance], bold: true },
          ...items('Less: bank transactions not yet recorded in the books', r.unrecordedInBooks, -1),
          { cells: [t('Reconciled statement balance'), r.reconciledStatementBalance], bold: true },
          { cells: [t('Balance as per books (bank account)'), r.bookBalance], bold: true },
          { cells: [t('Difference'), r.difference], bold: true },
          ...items('Add: deposits in transit', r.depositsInTransit, 1),
          ...items('Less: unpresented cheques and payments', r.unpresentedPayments, -1),
          { cells: [t('Expected bank balance after clearing'), r.projectedBalance], bold: true },
        ],
        note: r.difference !== 0 ? t('A difference means some bank entries were posted directly to the bank account or statement lines are missing. Check the General Ledger of the bank account.') : undefined,
      };
    }
    case 'vat': {
      const v = vatReturn(s, p.from, p.to);
      return {
        title,
        subtitle: range,
        columns: ['', t('Taxable amount'), t('VAT')],
        rows: [
          { cells: [t('VAT on sales and other outputs'), '', v.outputVat], bold: true },
          ...v.supplies.map((l) => ({ cells: [t(l.label), l.base, l.vat] as (string | number)[], level: 1 as const })),
          { cells: [t('Recoverable input VAT'), '', v.inputVat], bold: true },
          ...v.purchases.map((l) => ({ cells: [t(l.label), l.base, l.vat] as (string | number)[], level: 1 as const })),
          { cells: [t(v.net >= 0 ? 'Net VAT payable' : 'Net VAT refundable'), '', Math.abs(v.net)], bold: true },
        ],
      };
    }
    case 'expenses': {
      const [pf, pt] = previousPeriod(p.from, p.to);
      const e = expenseReport(s, p.from, p.to, pf, pt);
      return {
        title,
        subtitle: `${range} (${t('compared with')} ${fmtDate(pf)} – ${fmtDate(pt)})`,
        columns: [t('Category'), t('This period'), t('Previous period'), '%'],
        rows: [
          ...e.rows.map((r) => ({ cells: [accName(r.account), r.amount, r.previous, `${r.share}%`] as (string | number)[], onPress: () => openLedger(r.account.id) })),
          { cells: [t('Total expenses'), e.total, e.previousTotal, '100%'], bold: true },
        ],
      };
    }
    case 'budget': {
      const budget = s.budgets.find((b) => b.id === x.budgetId) ?? s.budgets.find((b) => b.active);
      if (!budget) return { title, subtitle: range, columns: [], rows: [], note: t('Create a budget first (Accounting › Budgets).') };
      const r = budgetVsActual(s, budget.id, p.from, p.to);
      const row = (y: BudgetRow, bold = false): Row => ({
        cells: [y.account.code ? accName(y.account) : t(y.account.name), y.budget, y.actual, y.variance, `${y.achieved}%`],
        bold,
        onPress: y.account.code ? () => openLedger(y.account.id) : undefined,
      });
      return {
        title: `${title} · ${budget.name}`,
        subtitle: `${range} · ${r.months} ${t(r.months === 1 ? 'month' : 'months')}`,
        columns: [t('Account'), t('Budget'), t('Actual'), t('Variance'), t('Achieved')],
        rows: [
          ...r.rows.filter((y) => y.account.type.startsWith('income')).map((y) => row(y)),
          row(r.income, true),
          ...r.rows.filter((y) => y.account.type.startsWith('expense')).map((y) => row(y)),
          row(r.expense, true),
        ],
      };
    }
    case 'payroll': {
      const r = payrollReport(s, p.from, p.to);
      return {
        title,
        subtitle: `${range} · ${r.runs.map((x2) => fmtDate(x2.month)).join(', ') || t('No payroll in this period.')}`,
        columns: [t('Employee'), t('Basic'), t('Allowances'), t('Overtime'), t('Deductions'), t('Social insurance (employee)'), t('Social insurance (employer)'), t('Net Salary')],
        rows: [
          ...r.rows.map((y) => ({ cells: [y.name, y.basic, y.allowances, y.overtime, y.deductions, y.siEmployee, y.siEmployer, y.net] as (string | number)[] })),
          { cells: [t('Total'), r.totals.basic, r.totals.allowances, r.totals.overtime, r.totals.deductions, r.totals.siEmployee, r.totals.siEmployer, r.totals.net], bold: true },
          { cells: [t('Total cost to company'), '', '', '', '', '', '', r.totals.cost], bold: true },
        ],
      };
    }
    case 'analytic':
      return {
        title,
        subtitle: range,
        columns: [t('Analytic Account'), t('Income'), t('Expenses'), t('Balance')],
        rows: analyticReport(s, p.from, p.to).map((r) => ({ cells: [r.name, r.income, r.expense, r.balance] })),
        note: s.analyticAccounts.length ? undefined : t('Create analytic accounts (Accounting › Configuration) and set them on invoice lines to track profitability per project, branch or department.'),
      };
    default:
      return { title: t('Report'), subtitle: '', columns: [], rows: [] };
  }
}

export default function ReportScreen() {
  const { report, accountId, journalId, budgetId, preset } = useLocalSearchParams<{ report: string; accountId?: string; journalId?: string; budgetId?: string; preset?: PresetKey }>();
  // Remount per report so each one starts with its own default period.
  return <ReportView key={`${report}-${preset ?? ''}`} report={report} preset={preset} extra={{ accountId: accountId || undefined, journalId, budgetId }} />;
}

function ReportView({ report, preset, extra }: { report: string; preset?: PresetKey; extra: Extra }) {
  const s = useBooks();
  const money = useMoney();
  const { t, fmtDate, lang } = useT();
  const single = SINGLE_DATE.has(report);
  const [period, setPeriod] = usePeriod(s.settings.fiscalYearLastMonth, preset ?? (report === 'vat' ? 'this_quarter' : 'this_fy'), single);
  const [journalId, setJournalId] = useState(extra.journalId ?? s.journals.find((j) => j.type === 'bank' && j.active)?.id);
  const [budgetId, setBudgetId] = useState(extra.budgetId ?? s.budgets.find((b) => b.active)?.id);
  const data = useMemo(() => build(report, s, period, { ...extra, journalId, budgetId }, t, fmtDate), [report, s, period, extra, journalId, budgetId, t, fmtDate]);
  const wide = data.columns.length > 3;
  const fileBase = `${data.title.replace(/\s+/g, '-')}-${period.to}`;

  const exportCsv = () =>
    shareTextFile(`${fileBase}.csv`, toCsv([data.columns, ...data.rows.map((r) => r.cells)]), 'text/csv').catch((e) => notify('Export failed', String(e)));
  const exportPdf = () => sharePdf(reportHtml(s, data, lang), fileBase).catch((e) => notify(t('Export failed'), String(e)));
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
            style={[st.cell, st.first, { paddingStart: 4 + (r.level ?? 0) * 12 }, r.bold && { fontWeight: '700' }, r.onPress ? { color: colors.primary } : null, !wide && neg(r.cells[0])]}
          >
            {fmt(r.cells[0])}
          </Text>
          {wide ? (
            <View style={[st.figures, { paddingStart: 4 + (r.level ?? 0) * 12 }]}>
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
      {report === 'bank-reconciliation' && (
        <SelectField label={t('Bank Journal')} value={journalId} allowClear={false} options={journalOptions(s, ['bank'], t)} onChange={(v) => v && setJournalId(v)} />
      )}
      {report === 'budget' && s.budgets.length > 0 && (
        <SelectField label={t('Budget')} value={budgetId} allowClear={false} options={s.budgets.map((b) => ({ value: b.id, label: b.name }))} onChange={(v) => v && setBudgetId(v)} />
      )}
      <Card style={{ padding: space.md }}>
        <Text style={{ color: colors.muted, marginBottom: space.sm }}>
          {data.subtitle} · {s.settings.currency}
          {extra.accountId ? ` · ${t('filtered on one account')}` : ''}
        </Text>
        {data.rows.length === 0 ? <Text style={{ color: colors.muted }}>{t('No data for this period.')}</Text> : table}
        {data.note && <Text style={{ color: colors.muted, marginTop: space.md }}>{data.note}</Text>}
      </Card>
      <ButtonRow>
        <Button small variant="secondary" title="PDF" icon="document-outline" onPress={exportPdf} />
        <Button small variant="secondary" title="CSV / Excel" icon="grid-outline" onPress={exportCsv} />
        {extra.accountId && <Button small variant="ghost" title={t('All accounts')} onPress={() => router.setParams({ accountId: '' })} />}
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
