import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useBooks, useLookups, useMoney, useStore } from '../../data/store';
import {
  applyOutstanding,
  cancelMove,
  computeDueDate,
  deleteDraft,
  duplicateMove,
  invoiceStatus,
  isInvoice,
  isSaleDoc,
  MOVE_TYPE_LABELS,
  moveBalance,
  newInvoiceLine,
  newMove,
  outstandingForInvoice,
  postMove,
  resetToDraft,
  saveDraft,
  unreconcilePair,
} from '../../domain/engine';
import { computeInvoiceTotals } from '../../domain/tax';
import { AppState, InvoiceLine, Move, MoveLine, MoveType, Partner } from '../../domain/types';
import { newId, round } from '../../domain/utils';
import { accountOptions, ENTITIES, journalOptions, partnerOptions, taxOptions, termOptions } from '../../features/entities';
import { moveBadge } from '../../features/status';
import { useT } from '../../i18n';
import { invoiceHtml } from '../../services/documents';
import { printHtml, sharePdf } from '../../services/files';
import { Badge, Button, ButtonRow, Card, Divider, Row, Screen, SectionTitle } from '../../ui/components';
import { confirm, notify } from '../../ui/dialog';
import { DateField, MultiSelectField, NumberField, SelectField, TextField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

const ORIGIN_NOTES: Partial<Record<Move['origin'], string>> = {
  payment: 'Generated automatically from a payment.',
  statement: 'Generated automatically from a bank transaction.',
  asset: 'Generated automatically from an asset.',
  tax_closing: 'Generated automatically by the tax closing.',
  cheque: 'Generated automatically when the cheque cleared.',
  cash_closing: 'Generated automatically by the daily cash closing.',
  payroll: 'Generated automatically by the payroll.',
};

export default function MoveScreen() {
  const params = useLocalSearchParams<{ id: string; type?: MoveType; partnerId?: string }>();
  const { run, runWith } = useStore();
  const s = useBooks();
  const lk = useLookups();
  const { t } = useT();
  const stored = params.id !== 'new' ? s.moves.find((m) => m.id === params.id) : undefined;

  const [draft, setDraft] = useState<Move>(() => {
    if (stored) return stored;
    const t = params.type ?? 'out_invoice';
    const partner = params.partnerId ? lk.partners.get(params.partnerId) : undefined;
    return newMove(s, t, { partnerId: partner?.id, paymentTermId: partner?.paymentTermId ?? (isInvoice(t) ? s.settings.defaultPaymentTermId : undefined) });
  });
  const [dirty, setDirty] = useState(!stored);
  // Pick up the saved version after save/post/reset.
  const [synced, setSynced] = useState(stored);
  if (stored && stored !== synced) {
    setSynced(stored);
    setDraft(stored);
    setDirty(false);
  }

  if (params.id !== 'new' && !stored) {
    return <Text style={{ padding: 20 }}>{t('This entry no longer exists.')}</Text>;
  }

  const editable = draft.state === 'draft';
  const invoice = isInvoice(draft.moveType);
  const sale = isSaleDoc(draft.moveType);
  const update = (patch: Partial<Move>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const persist = (op: (st: AppState) => AppState) => {
    const ok = run((st) => op(dirty || !stored ? saveDraft(st, draft) : st));
    if (ok && params.id === 'new') router.setParams({ id: draft.id });
    return ok;
  };

  const actions = {
    save: () => persist((st) => st),
    confirm: () => persist((st) => postMove(st, draft.id)),
    reset: () => run((st) => resetToDraft(st, draft.id)),
    cancel: async () => {
      if (await confirm(t('Cancel entry'), t('Cancelled entries are kept for audit but have no accounting impact.'), t('Cancel Entry'), true)) persist((st) => cancelMove(st, draft.id));
    },
    remove: async () => {
      if (!stored) return router.back();
      if ((await confirm(t('Delete'), t('Delete this draft permanently?'), t('Delete'), true)) && run((st) => deleteDraft(st, draft.id))) router.back();
    },
    duplicate: () => {
      const id = runWith((st) => {
        const r = duplicateMove(st, draft.id);
        return { state: r.state, value: r.move.id };
      });
      if (id) router.replace({ pathname: '/moves/[id]', params: { id } });
    },
    pdf: () => sharePdf(invoiceHtml(s, draft), `${draft.name === '/' ? 'Draft' : draft.name.replace(/\//g, '-')}`).catch((e) => notify(t('Could not share'), String(e))),
    print: () => printHtml(invoiceHtml(s, draft)).catch((e) => notify(t('Could not print'), String(e))),
  };

  const badge = moveBadge(draft, invoice ? invoiceStatus(s, draft, lk.reconcileIndex) : undefined);
  const title = draft.name === '/' ? `${t('Draft')} ${t(MOVE_TYPE_LABELS[draft.moveType])}` : draft.name;
  const missingVatin = invoice && sale && s.settings.vatRegistered && !s.settings.companyTaxId;

  return (
    <Screen>
      <Stack.Screen options={{ title: t(MOVE_TYPE_LABELS[draft.moveType]) }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, flex: 1 }}>{title}</Text>
          <Badge label={t(badge.label)} tone={badge.tone} />
        </View>
        {draft.reversedEntryId && (
          <Pressable onPress={() => router.push({ pathname: '/moves/[id]', params: { id: draft.reversedEntryId! } })}>
            <Text style={{ color: colors.accent, marginTop: 4 }}>
              {t('Reversal of')} {s.moves.find((m) => m.id === draft.reversedEntryId)?.name}
            </Text>
          </Pressable>
        )}
        <View style={{ marginTop: space.md }}>
          <ButtonRow>
            {editable && <Button small title={t('Confirm')} icon="checkmark" onPress={actions.confirm} />}
            {editable && dirty && <Button small variant="secondary" title={t('Save')} icon="save-outline" onPress={actions.save} />}
            {draft.state === 'posted' && invoice && <PostedInvoiceActions move={draft} />}
            {draft.state !== 'draft' && draft.origin === 'manual' && <Button small variant="secondary" title={t('Reset to Draft')} icon="arrow-undo-outline" onPress={actions.reset} />}
            {invoice && <Button small variant="secondary" title="PDF" icon="share-outline" onPress={actions.pdf} />}
            {invoice && <Button small variant="secondary" title={t('Print')} icon="print-outline" onPress={actions.print} />}
            {stored && draft.origin === 'manual' && <Button small variant="secondary" title={t('Duplicate')} icon="copy-outline" onPress={actions.duplicate} />}
            {draft.state === 'posted' && draft.moveType === 'entry' && draft.origin === 'manual' && (
              <Button small variant="secondary" title={t('Reverse')} icon="swap-horizontal-outline" onPress={() => router.push({ pathname: '/moves/reverse', params: { id: draft.id } })} />
            )}
            {editable && draft.name !== '/' && <Button small variant="ghost" title={t('Cancel Entry')} onPress={actions.cancel} />}
            {editable && draft.name === '/' && <Button small variant="ghost" title={t('Delete')} onPress={actions.remove} />}
          </ButtonRow>
        </View>
      </Card>

      {draft.origin !== 'manual' && (
        <Card>
          <Text style={{ color: colors.muted }}>{t(ORIGIN_NOTES[draft.origin] ?? 'Generated automatically.')}</Text>
        </Card>
      )}
      {missingVatin && (
        <Card style={{ borderColor: colors.warning }}>
          <Text style={{ color: colors.warning }}>{t('Add your VAT registration number (VATIN) in Settings: it must appear on every tax invoice.')}</Text>
        </Card>
      )}

      <Card>
        {invoice ? <InvoiceHeader draft={draft} update={update} editable={editable} sale={sale} /> : <EntryHeader draft={draft} update={update} editable={editable} />}
      </Card>

      {invoice ? <InvoiceLines draft={draft} update={update} editable={editable} sale={sale} /> : <EntryLines draft={draft} update={update} editable={editable} />}

      {invoice && draft.state === 'posted' && <PaymentsWidget move={draft} />}

      <Card>
        <TextField
          label={t(invoice ? 'Terms and Conditions / Notes' : 'Internal Note')}
          value={draft.narration}
          onChange={(v) => update({ narration: v })}
          multiline
          editable={editable}
        />
      </Card>

      {invoice && draft.state === 'posted' && <JournalItems lines={draft.lines} />}
    </Screen>
  );
}

function PostedInvoiceActions({ move }: { move: Move }) {
  const s = useBooks();
  const { t } = useT();
  const st = invoiceStatus(s, move);
  return (
    <>
      {st.residual > 0 && (
        <Button small title={t('Register Payment')} icon="cash-outline" onPress={() => router.push({ pathname: '/payments/new', params: { moveId: move.id } })} />
      )}
      {(move.moveType === 'out_invoice' || move.moveType === 'in_invoice') && (
        <Button small variant="secondary" title={t(move.moveType === 'out_invoice' ? 'Credit Note' : 'Vendor Credit Note')} icon="return-down-back-outline" onPress={() => router.push({ pathname: '/moves/reverse', params: { id: move.id } })} />
      )}
    </>
  );
}

function usePartnerQuickCreate(kind: 'customer' | 'supplier') {
  const { runWith } = useStore();
  return (name: string) =>
    runWith((st) => {
      const p: Partner = ENTITIES.partners.create(st, { kind, name });
      return { state: { ...st, partners: [...st.partners, p] }, value: p.id };
    });
}

function InvoiceHeader({ draft, update, editable, sale }: { draft: Move; update: (p: Partial<Move>) => void; editable: boolean; sale: boolean }) {
  const s = useBooks();
  const lk = useLookups();
  const { t, fmtDate: formatDate } = useT();
  const quickCreate = usePartnerQuickCreate(sale ? 'customer' : 'supplier');
  const term = draft.paymentTermId ? lk.terms.get(draft.paymentTermId) : undefined;
  const invoiceDate = draft.invoiceDate ?? draft.date;
  return (
    <>
      <SelectField
        label={t(sale ? 'Customer' : 'Vendor')}
        value={draft.partnerId}
        required
        editable={editable}
        options={partnerOptions(s, sale ? 'customer' : 'supplier')}
        onCreate={quickCreate}
        onChange={(v) => {
          const p = v ? lk.partners.get(v) : undefined;
          update({ partnerId: v, paymentTermId: p?.paymentTermId ?? draft.paymentTermId });
        }}
      />
      <DateField
        label={t(sale ? 'Invoice Date' : 'Bill Date')}
        value={invoiceDate}
        editable={editable}
        onChange={(v) => update({ invoiceDate: v, date: sale ? v : draft.date === invoiceDate ? v : draft.date })}
      />
      {!sale && <DateField label={t('Accounting Date')} value={draft.date} editable={editable} onChange={(v) => update({ date: v })} />}
      <SelectField
        label={t('Payment Terms')}
        value={draft.paymentTermId}
        editable={editable}
        options={termOptions(s, t)}
        onChange={(v) => update({ paymentTermId: v })}
      />
      {term ? (
        <View style={{ marginBottom: space.md }}>
          <Row label={t('Due Date')} value={formatDate(computeDueDate(invoiceDate, term))} />
        </View>
      ) : (
        <DateField label={t('Due Date')} value={draft.dueDate ?? invoiceDate} editable={editable} onChange={(v) => update({ dueDate: v })} />
      )}
      <TextField label={t(sale ? 'Customer Reference' : 'Bill Reference')} value={draft.ref} onChange={(v) => update({ ref: v })} editable={editable} />
      <Row label={t('Journal')} value={t(lk.journals.get(draft.journalId)?.name ?? '')} />
      {draft.partnerId && lk.partners.get(draft.partnerId)?.taxId ? <Row label={t('Customer VATIN')} value={lk.partners.get(draft.partnerId)!.taxId} /> : null}
    </>
  );
}

function InvoiceLines({ draft, update, editable, sale }: { draft: Move; update: (p: Partial<Move>) => void; editable: boolean; sale: boolean }) {
  const s = useBooks();
  const lk = useLookups();
  const money = useMoney();
  const { t } = useT();
  const totals = useMemo(() => computeInvoiceTotals(draft.invoiceLines, lk.taxes, s.settings.decimals), [draft.invoiceLines, lk.taxes, s.settings.decimals]);
  const journal = lk.journals.get(draft.journalId);
  const setLine = (id: string, patch: Partial<InvoiceLine>) => update({ invoiceLines: draft.invoiceLines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const add = () => {
    const tax = sale ? s.settings.defaultSaleTaxId : s.settings.defaultPurchaseTaxId;
    update({ invoiceLines: [...draft.invoiceLines, newInvoiceLine({ taxIds: tax ? [tax] : [], accountId: journal?.defaultAccountId })] });
  };
  const productOptions = s.products.filter((p) => p.active).map((p) => ({ value: p.id, label: ENTITIES.products.display(p), hint: money(sale ? p.salePrice : p.cost) }));
  const accOpts = accountOptions(s, undefined, t);
  const taxOpts = taxOptions(s, sale ? 'sale' : 'purchase', t);
  const analyticOpts = s.analyticAccounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));

  return (
    <>
      <SectionTitle right={editable ? <Button small variant="ghost" title={t('Add a line')} icon="add" onPress={add} /> : undefined}>{t('Invoice Lines')}</SectionTitle>
      {draft.invoiceLines.length === 0 && (
        <Card>
          <Text style={{ color: colors.muted, textAlign: 'center' }}>{t('No lines yet.')}</Text>
          {editable && <Button title={t('Add a line')} icon="add" variant="secondary" onPress={add} style={{ marginTop: space.md }} />}
        </Card>
      )}
      {draft.invoiceLines.map((l, i) => (
        <Card key={l.id}>
          {editable ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
                <Text style={{ fontWeight: '700', color: colors.muted }}>
                  {t('Line')} {i + 1}
                </Text>
                <Pressable hitSlop={8} onPress={() => update({ invoiceLines: draft.invoiceLines.filter((x) => x.id !== l.id) })}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>
              <SelectField
                label={t('Product')}
                value={l.productId}
                options={productOptions}
                onChange={(pid) => {
                  const p = pid ? lk.products.get(pid) : undefined;
                  if (!p) return setLine(l.id, { productId: undefined });
                  setLine(l.id, {
                    productId: p.id,
                    label: p.name,
                    priceUnit: sale ? p.salePrice : p.cost,
                    taxIds: sale ? p.saleTaxIds : p.purchaseTaxIds,
                    accountId: (sale ? p.incomeAccountId : p.expenseAccountId) ?? journal?.defaultAccountId,
                  });
                }}
              />
              <TextField label={t('Description')} value={l.label} onChange={(v) => setLine(l.id, { label: v })} />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <NumberField compact label={t('Quantity')} value={l.quantity} onChange={(v) => setLine(l.id, { quantity: v })} />
                <NumberField compact label={t('Unit Price')} value={l.priceUnit} onChange={(v) => setLine(l.id, { priceUnit: v })} />
                <NumberField compact label={t('Disc. %')} value={l.discount} onChange={(v) => setLine(l.id, { discount: v })} />
              </View>
              <MultiSelectField label={t('Taxes')} value={l.taxIds} options={taxOpts} onChange={(v) => setLine(l.id, { taxIds: v })} />
              <SelectField label={t('Account')} value={l.accountId} options={accOpts} onChange={(v) => setLine(l.id, { accountId: v })} />
              {analyticOpts.length > 0 && <SelectField label={t('Analytic')} value={l.analyticAccountId} options={analyticOpts} onChange={(v) => setLine(l.id, { analyticAccountId: v })} />}
              <Row label={t('Subtotal')} value={money(totals.lines[i]?.untaxed ?? 0)} bold />
            </>
          ) : (
            <>
              <Text style={{ fontWeight: '600', fontSize: 15 }}>{l.label || '—'}</Text>
              <Row
                label={`${l.quantity} × ${money(l.priceUnit, false)}${l.discount ? ` (-${l.discount}%)` : ''}${l.taxIds.length ? ` · ${l.taxIds.map((x) => t(lk.taxes.get(x)?.name ?? '')).join('، ')}` : ''}`}
                value={money(totals.lines[i]?.untaxed ?? 0)}
              />
              {l.accountId && (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {lk.accounts.get(l.accountId)?.code} {t(lk.accounts.get(l.accountId)?.name ?? '')}
                </Text>
              )}
            </>
          )}
        </Card>
      ))}
      <Card>
        <Row label={t('Untaxed Amount')} value={money(totals.untaxed)} />
        {totals.byTax.map((x) => (
          <Row key={x.taxId} label={`${t(lk.taxes.get(x.taxId)?.name ?? 'Tax')}${x.reverseCharge ? ` (${t('self-assessed')})` : ''}`} value={money(x.amount)} />
        ))}
        <Divider />
        <Row label={t('Total')} value={money(totals.total)} bold />
      </Card>
    </>
  );
}

function PaymentsWidget({ move }: { move: Move }) {
  const s = useBooks();
  const { run } = useStore();
  const money = useMoney();
  const { t, fmtDate: formatDate } = useT();
  const st = invoiceStatus(s, move);
  const applied = s.reconciles
    .filter((r) => r.debitMoveId === move.id || r.creditMoveId === move.id)
    .map((r) => {
      const otherId = r.debitMoveId === move.id ? r.creditMoveId : r.debitMoveId;
      return { r, other: s.moves.find((m) => m.id === otherId) };
    });
  const outstanding = outstandingForInvoice(s, move);
  const openOther = (m?: Move) => {
    if (!m) return;
    const pay = m.origin === 'payment' ? s.payments.find((p) => p.id === m.originId) : undefined;
    if (pay) router.push({ pathname: '/payments/[id]', params: { id: pay.id } });
    else router.push({ pathname: '/moves/[id]', params: { id: m.id } });
  };
  return (
    <Card>
      <SectionTitle>{t('Payments')}</SectionTitle>
      {applied.map(({ r, other }) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Pressable style={{ flex: 1 }} onPress={() => openOther(other)}>
            <Row label={`${t('Paid on')} ${formatDate(r.date)} · ${other?.name ?? ''}`} value={money(r.amount)} valueStyle={{ color: colors.accent }} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={async () => {
              if (await confirm(t('Unreconcile'), t('Remove this payment from the invoice? The payment stays as an outstanding credit.'), t('Unreconcile'))) run((x) => unreconcilePair(x, move.id, other!.id));
            }}
          >
            <Ionicons name="close-circle-outline" size={20} color={colors.muted} />
          </Pressable>
        </View>
      ))}
      <Divider />
      <Row label={t('Amount Due')} value={money(st.residual)} bold />
      {outstanding.length > 0 && st.residual > 0 && (
        <>
          <Text style={{ marginTop: space.md, fontWeight: '700', color: colors.accent }}>{t(move.moveType.startsWith('out') ? 'Outstanding credits' : 'Outstanding debits')}</Text>
          {outstanding.map((o) => (
            <View key={o.line.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, color: colors.text }}>
                {o.move.name} · {formatDate(o.move.date)} · {money(Math.abs(o.residual))}
              </Text>
              <Button small variant="ghost" title={t('Add')} onPress={() => run((x) => applyOutstanding(x, move.id, o.line.id))} />
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

function JournalItems({ lines }: { lines: MoveLine[] }) {
  const lk = useLookups();
  const money = useMoney();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <SectionTitle>{t('Journal Items')}</SectionTitle>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open &&
        lines.map((l) => {
          const a = lk.accounts.get(l.accountId);
          return (
            <View key={l.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontWeight: '600' }}>
                {a?.code} {t(a?.name ?? '')}
              </Text>
              <Row label={l.label || ' '} value={l.debit ? `${t('Dr')} ${money(l.debit, false)}` : `${t('Cr')} ${money(l.credit, false)}`} />
            </View>
          );
        })}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Miscellaneous journal entries
// ---------------------------------------------------------------------------

function EntryHeader({ draft, update, editable }: { draft: Move; update: (p: Partial<Move>) => void; editable: boolean }) {
  const s = useBooks();
  const { t } = useT();
  return (
    <>
      <DateField label={t('Accounting Date')} value={draft.date} editable={editable} onChange={(v) => update({ date: v })} />
      <TextField label={t('Reference')} value={draft.ref} editable={editable} onChange={(v) => update({ ref: v })} />
      <SelectField
        label={t('Journal')}
        value={draft.journalId}
        required
        editable={editable && draft.name === '/'}
        options={journalOptions(s, undefined, t)}
        onChange={(v) => v && update({ journalId: v })}
      />
    </>
  );
}

function EntryLines({ draft, update, editable }: { draft: Move; update: (p: Partial<Move>) => void; editable: boolean }) {
  const s = useBooks();
  const lk = useLookups();
  const money = useMoney();
  const { t } = useT();
  const d = s.settings.decimals;
  const { debit, credit } = moveBalance(draft.lines);
  const diff = round(debit - credit, d);
  const setLine = (id: string, patch: Partial<MoveLine>) => update({ lines: draft.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const add = () =>
    update({
      lines: [
        ...draft.lines,
        { id: newId(), accountId: '', label: draft.ref, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, kind: 'other' },
      ],
    });
  const accOpts = accountOptions(s, undefined, t);
  const partnerOpts = partnerOptions(s);
  const analyticOpts = s.analyticAccounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));
  return (
    <>
      <SectionTitle right={editable ? <Button small variant="ghost" title={t('Add a line')} icon="add" onPress={add} /> : undefined}>{t('Journal Items')}</SectionTitle>
      {draft.lines.map((l, i) => (
        <Card key={l.id}>
          {editable ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm }}>
                <Text style={{ fontWeight: '700', color: colors.muted }}>
                  {t('Line')} {i + 1}
                </Text>
                <Pressable hitSlop={8} onPress={() => update({ lines: draft.lines.filter((x) => x.id !== l.id) })}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>
              <SelectField label={t('Account')} required value={l.accountId || undefined} options={accOpts} onChange={(v) => setLine(l.id, { accountId: v ?? '' })} />
              <SelectField label={t('Partner')} value={l.partnerId} options={partnerOpts} onChange={(v) => setLine(l.id, { partnerId: v })} />
              <TextField label={t('Label')} value={l.label} onChange={(v) => setLine(l.id, { label: v })} />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <NumberField compact label={t('Debit')} value={l.debit} onChange={(v) => setLine(l.id, { debit: v, credit: v ? 0 : l.credit })} />
                <NumberField compact label={t('Credit')} value={l.credit} onChange={(v) => setLine(l.id, { credit: v, debit: v ? 0 : l.debit })} />
              </View>
              {analyticOpts.length > 0 && <SelectField label={t('Analytic')} value={l.analyticAccountId} options={analyticOpts} onChange={(v) => setLine(l.id, { analyticAccountId: v })} />}
            </>
          ) : (
            <>
              <Text style={{ fontWeight: '600' }}>
                {lk.accounts.get(l.accountId)?.code} {t(lk.accounts.get(l.accountId)?.name ?? '')}
              </Text>
              <Row
                label={[l.partnerId ? lk.partners.get(l.partnerId)?.name : '', l.label].filter(Boolean).join(' · ') || ' '}
                value={l.debit ? `${t('Dr')} ${money(l.debit, false)}` : `${t('Cr')} ${money(l.credit, false)}`}
              />
            </>
          )}
        </Card>
      ))}
      <Card>
        <Row label={t('Total Debit')} value={money(debit)} />
        <Row label={t('Total Credit')} value={money(credit)} />
        {diff !== 0 && <Row label={t('Difference')} value={money(diff)} valueStyle={{ color: colors.danger }} bold />}
      </Card>
    </>
  );
}
