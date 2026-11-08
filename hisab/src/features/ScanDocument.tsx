import { router, usePathname } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Text, View } from 'react-native';
import { useBooks, useLookups, useMoney, usePermissions, useStore } from '../data/store';
import { addAttachment, attachmentsFor } from '../domain/attachments';
import { deleteMove, saveDraft } from '../domain/engine';
import { addVendorFromReading, classifyDocument, DocumentKind, draftBillFromReading, isAccountingDocument, readReceipt, RECEIPT_MESSAGES, suggestAccount } from '../domain/receiptReader';
import { computeInvoiceTotals } from '../domain/tax';
import { AppState, Move } from '../domain/types';
import { today } from '../domain/utils';
import { useT } from '../i18n';
import { pickDocumentFiles, pickReceiptPhoto } from '../services/files';
import { Button, ButtonRow, Card, Row, SectionTitle } from '../ui/components';
import { notify } from '../ui/dialog';
import { Segmented } from '../ui/fields';
import { colors, space } from '../ui/theme';
import DocumentReader, { ReaderResult } from './DocumentReader';
import { ScanItem, scanSession, useScanItem, useScanItems } from './scanSession';

export const KIND_LABELS: Record<DocumentKind, string> = { bill: 'Purchase bill', credit: 'Vendor credit note', expense: 'Cash expense' };

/** Create the draft bill or credit note for a read document (with its first page as the receipt photo). */
function createDraft(st: AppState, item: ScanItem, kind: 'bill' | 'credit', label: string, user?: string): { state: AppState; value: string } {
  const move = draftBillFromReading(st, item.reading!, today(), label, { kind, accountId: item.accountId });
  let next = saveDraft(st, move);
  if (item.preview) next = addAttachment(next, { ownerId: move.id, dataUri: item.preview, createdBy: user });
  return { state: next, value: move.id };
}

/** Opening a scanned document, and changing where it goes. */
export function useScanActions() {
  const { run, runWith, user } = useStore();
  const { t } = useT();

  const open = useCallback((item: ScanItem, replace = false) => {
    const go = replace ? router.replace : router.push;
    if (item.kind === 'expense') {
      if (item.targetId) go({ pathname: '/payments/[id]', params: { id: item.targetId } });
      else go({ pathname: '/payments/new', params: { partnerType: 'other', direction: 'outbound', scan: item.id } });
    } else if (item.targetId) go({ pathname: '/moves/[id]', params: { id: item.targetId, scan: item.id } });
  }, []);

  /** Switch a document between purchase bill, vendor credit note and cash expense. */
  const switchKind = useCallback(
    (item: ScanItem, kind: DocumentKind, current?: Move) => {
      if (kind === item.kind) return;
      const label = t('Purchase as per supplier invoice');
      if (current && kind !== 'expense') {
        // Bill ↔ credit note: the same draft, another document type.
        if (run((st) => saveDraft(st, { ...current, moveType: kind === 'credit' ? 'in_refund' : 'in_invoice' }))) scanSession.update(item.id, { kind });
        return;
      }
      if (current && kind === 'expense') {
        // The draft (never numbered) is removed; the photo moves to the cash expense.
        const removed = runWith((st) => ({ state: deleteMove(st, current.id), value: { photo: attachmentsFor(st, current.id)[0]?.dataUri } }));
        if (!removed) return;
        const updated = { ...item, kind, targetId: undefined, preview: removed.photo ?? item.preview };
        scanSession.update(item.id, updated);
        open(updated, true);
        return;
      }
      if (kind !== 'expense') {
        const id = runWith((st) => createDraft(st, item, kind, label, user?.name));
        if (!id) return;
        const updated = { ...item, kind, targetId: id };
        scanSession.update(item.id, updated);
        open(updated, true);
      }
    },
    [open, run, runWith, t, user?.name],
  );

  return { open, switchKind };
}

/**
 * Reads the queued documents one after another, in the background, so the user can keep working.
 * Mounted once, below the sign-in gate.
 */
export function ScanHost() {
  const items = useScanItems();
  const { runWith, user } = useStore();
  const { t } = useT();
  const reading = items.find((i) => i.status === 'reading');
  const queued = items.find((i) => i.status === 'queued');
  const readingId = reading?.id;

  useEffect(() => {
    if (!reading && queued) scanSession.update(queued.id, { status: 'reading', step: 'reading' });
  }, [reading, queued]);
  // Signing out (or switching user) forgets the list: it is never shown to the next person.
  useEffect(() => () => scanSession.clear(), [user?.id]);

  const onProgress = useCallback(async (step: 'reading' | 'recognising') => {
    if (readingId) scanSession.update(readingId, { step });
  }, [readingId]);
  // The reader's own messages are technical (and English): show one plain message instead.
  const onError = useCallback(async () => {
    if (readingId) scanSession.update(readingId, { status: 'failed', source: null, error: 'Could not read this file. Use a PDF, JPG or PNG that is not password-protected.' });
  }, [readingId]);
  const onResult = useCallback(
    async (result: ReaderResult) => {
      const item = scanSession.get(readingId);
      if (!item) return;
      const done = runWith((st) => {
        const reading = readReceipt(st, result.text);
        if (reading.warnings.some((w) => w.message === RECEIPT_MESSAGES.noText)) return { state: st, value: { ...item, status: 'failed' as const, source: null, error: RECEIPT_MESSAGES.noText } };
        // Only accounting documents: anything else is refused and its picture forgotten.
        if (!isAccountingDocument(result.text, reading)) return { state: st, value: { ...item, status: 'failed' as const, source: null, error: RECEIPT_MESSAGES.notAccounting } };
        const kind = classifyDocument(result.text, reading);
        const ready: ScanItem = { ...item, status: 'ready', source: null, text: result.text, preview: result.preview, reading, kind, accountId: suggestAccount(st, result.text, reading.vendorId) };
        if (kind === 'expense') return { state: st, value: ready };
        const draft = createDraft(st, ready, kind, t('Purchase as per supplier invoice'), user?.name);
        return { state: draft.state, value: { ...ready, targetId: draft.value } };
      });
      scanSession.update(item.id, done ?? { status: 'failed', source: null });
    },
    [readingId, runWith, t, user?.name],
  );

  if (!reading?.source) return null;
  return <DocumentReader source={reading.source} onResult={onResult} onError={onError} onProgress={onProgress} dom={{ style: { width: 1, height: 1, position: 'absolute' }, scrollEnabled: false }} />;
}

/** "Scan Paper" (camera) and "Upload PDF / Photo" (one or many files). */
export function ScanButtons({ card }: { card?: boolean }) {
  const can = usePermissions();
  const { t } = useT();
  const pathname = usePathname();
  if (!can.create) return null;

  const start = async (pick: () => Promise<{ dataUri: string; mimeType: string }[]>) => {
    try {
      const files = await pick();
      if (!files.length) return;
      scanSession.add(files);
      if (pathname !== '/scan') router.push('/scan');
    } catch (e) {
      notify(t('Could not open the file'), t(e instanceof Error ? e.message : String(e)));
    }
  };
  const buttons = (
    <ButtonRow>
      <Button small title={t('Scan Paper')} icon="scan-outline" onPress={() => start(async () => { const d = await pickReceiptPhoto('camera'); return d ? [{ dataUri: d, mimeType: 'image/jpeg' }] : []; })} />
      <Button small variant="secondary" title={t('Upload PDF / Photo')} icon="document-attach-outline" onPress={() => start(pickDocumentFiles)} />
    </ButtonRow>
  );
  if (!card) return buttons;
  return (
    <Card>
      <SectionTitle>{t('Scan or Upload')}</SectionTitle>
      <Text style={{ color: colors.muted, marginBottom: space.sm }}>{t('Photograph a bill or receipt, or upload PDFs. Hisab reads them on this phone and fills them in for you to check.')}</Text>
      {buttons}
    </Card>
  );
}

/** One-tap choice of where a scanned document goes. */
function KindSwitch({ item, current }: { item: ScanItem; current?: Move }) {
  const { t } = useT();
  const { switchKind } = useScanActions();
  return (
    <Segmented
      label={t('This document is a')}
      value={item.kind ?? 'bill'}
      onChange={(k: DocumentKind) => switchKind(item, k, current)}
      options={(['bill', 'credit', 'expense'] as DocumentKind[]).map((k) => ({ value: k, label: t(KIND_LABELS[k]) }))}
    />
  );
}

function Warnings({ item, calculated }: { item: ScanItem; calculated?: number }) {
  const s = useBooks();
  const money = useMoney();
  const { t } = useT();
  const total = item.reading?.total;
  const differs = total !== undefined && calculated !== undefined && Math.abs(calculated - total) >= 0.5 / 10 ** s.settings.decimals;
  return (
    <>
      {total !== undefined && (
        <>
          <Row label={t('Total on the paper')} value={money(total)} />
          {calculated !== undefined && <Row label={t('Total calculated by Hisab')} value={money(calculated)} bold valueStyle={differs ? { color: colors.danger } : undefined} />}
        </>
      )}
      {differs && <Text style={{ color: colors.danger, marginTop: space.xs }}>{t('The totals differ. Check the amount and the VAT on each line.')}</Text>}
      {item.reading?.warnings
        // A cash expense needs no vendor or invoice number.
        .filter((w) => item.kind !== 'expense' || ![RECEIPT_MESSAGES.noVendor, RECEIPT_MESSAGES.vendorGuess, RECEIPT_MESSAGES.noReference].includes(w.message as never))
        .map((w, i) => (
        <Text key={i} style={{ color: colors.warning, marginTop: space.xs }}>
          • {t(w.message, w.params)}
        </Text>
      ))}
    </>
  );
}

/** Banner on a draft bill or credit note created from a scan. */
export function ScanReview({ scan, move, onVendor }: { scan: string; move: Move; onVendor: (partnerId: string) => void }) {
  const s = useBooks();
  const lk = useLookups();
  const { runWith } = useStore();
  const can = usePermissions();
  const { t } = useT();
  const item = useScanItem(scan);
  if (!item || move.state !== 'draft') return null;
  const calculated = computeInvoiceTotals(move.invoiceLines, lk.taxes, s.settings.decimals).total;
  const guess = item.reading?.vendorGuess;
  return (
    <Card style={{ borderColor: item.reading?.warnings.length ? colors.warning : colors.border }}>
      <Text style={{ fontWeight: '700', fontSize: 15, color: colors.text, marginBottom: space.xs }}>{t('Read from the document')}</Text>
      <Text style={{ color: colors.muted, marginBottom: space.sm }}>{t('Check every field against the paper and correct anything that was misread, then save or confirm.')}</Text>
      {can.create && <KindSwitch item={item} current={move} />}
      <Warnings item={item} calculated={calculated} />
      {!move.partnerId && guess && can.create && (
        <View style={{ marginTop: space.sm }}>
          <Button
            small
            variant="secondary"
            icon="person-add-outline"
            title={t('Create vendor "{name}"', { name: guess })}
            onPress={() => {
              const id = runWith((st) => {
                const r = addVendorFromReading(st, guess, item.reading?.vatin);
                return { state: r.state, value: r.id };
              });
              if (id) onVendor(id);
            }}
          />
        </View>
      )}
    </Card>
  );
}

/** Banner on the pre-filled cash expense form. */
export function ScanExpenseBanner({ item }: { item: ScanItem }) {
  const can = usePermissions();
  const { t } = useT();
  return (
    <Card style={{ borderColor: item.reading?.warnings.length ? colors.warning : colors.border }}>
      <Text style={{ fontWeight: '700', fontSize: 15, color: colors.text, marginBottom: space.xs }}>{t('Read from the document')}</Text>
      <Text style={{ color: colors.muted, marginBottom: space.sm }}>{t('A cash expense paid on the spot. Check the amount, account and VAT, then confirm.')}</Text>
      {can.create && <KindSwitch item={item} />}
      <Warnings item={item} />
    </Card>
  );
}
