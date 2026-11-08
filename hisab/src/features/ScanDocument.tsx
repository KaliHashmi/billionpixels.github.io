import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useBooks, useLookups, useMoney, usePermissions, useStore } from '../data/store';
import { addAttachment } from '../domain/attachments';
import { saveDraft } from '../domain/engine';
import { addVendorFromReading, draftBillFromReading, readReceipt, ReceiptReading } from '../domain/receiptReader';
import { computeInvoiceTotals } from '../domain/tax';
import { Move } from '../domain/types';
import { today } from '../domain/utils';
import { useT } from '../i18n';
import { pickDocumentFile, pickReceiptPhoto } from '../services/files';
import { Button, ButtonRow, Card, Row } from '../ui/components';
import { notify } from '../ui/dialog';
import { colors, space } from '../ui/theme';
import DocumentReader, { ReaderResult } from './DocumentReader';

/**
 * "Scan Paper" and "Upload PDF / Photo": read a supplier invoice or receipt on the device and open it as a
 * draft purchase bill for the user to check and confirm. Nothing is sent anywhere.
 */
export function ScanDocumentButtons() {
  const { runWith, user } = useStore();
  const can = usePermissions();
  const { t } = useT();
  const [source, setSource] = useState<{ dataUri: string; mimeType: string } | null>(null);
  const [step, setStep] = useState<'reading' | 'recognising' | null>(null);

  const start = async (pick: () => Promise<{ dataUri: string; mimeType: string } | null>) => {
    try {
      const file = await pick();
      if (file) setSource(file);
    } catch (e) {
      notify(t('Could not open the file'), t(e instanceof Error ? e.message : String(e)));
    }
  };

  const onProgress = useCallback(async (s: 'reading' | 'recognising') => setStep(s), []);
  const onError = useCallback(
    async (message: string) => {
      setSource(null);
      setStep(null);
      notify(t('Could not read the document'), t(message));
    },
    [t],
  );
  const onResult = useCallback(
    async (result: ReaderResult) => {
      setSource(null);
      setStep(null);
      const created = runWith((st) => {
        const reading = readReceipt(st, result.text);
        const move = draftBillFromReading(st, reading, today(), t('Purchase as per supplier invoice'));
        let next = saveDraft(st, move);
        if (result.preview) next = addAttachment(next, { ownerId: move.id, dataUri: result.preview, createdBy: user?.name });
        return { state: next, value: { id: move.id, reading } };
      });
      if (!created) return;
      const { reading } = created;
      router.push({
        pathname: '/moves/[id]',
        params: { id: created.id, scan: JSON.stringify({ total: reading.total ?? null, warnings: reading.warnings, vendorGuess: reading.vendorGuess, vatin: reading.vatin }) },
      });
    },
    [runWith, t, user?.name],
  );

  if (!can.create) return null;
  return (
    <View style={{ gap: space.sm }}>
      <ButtonRow>
        <Button small title={t('Scan Paper')} icon="scan-outline" disabled={!!source} onPress={() => start(() => pickReceiptPhoto('camera').then((d) => (d ? { dataUri: d, mimeType: 'image/jpeg' } : null)))} />
        <Button small variant="secondary" title={t('Upload PDF / Photo')} icon="document-attach-outline" disabled={!!source} onPress={() => start(pickDocumentFile)} />
      </ButtonRow>
      {step && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ flex: 1, color: colors.text }}>
            {t(step === 'reading' ? 'Reading the document on this device…' : 'Recognising the text on the paper. This can take up to a minute…')}
          </Text>
        </Card>
      )}
      {source && <DocumentReader source={source} onResult={onResult} onError={onError} onProgress={onProgress} dom={{ style: { width: 1, height: 1 }, scrollEnabled: false }} />}
    </View>
  );
}

/** Shown on a draft bill created from a scan: what to check, and the paper's total next to Hisab's own calculation. */
export function ScanReview({ scan, move, onVendor }: { scan: string; move: Move; onVendor: (partnerId: string) => void }) {
  const s = useBooks();
  const { runWith } = useStore();
  const can = usePermissions();
  const lk = useLookups();
  const money = useMoney();
  const { t } = useT();
  let info: { total: number | null; warnings: ReceiptReading['warnings']; vendorGuess?: string; vatin?: string };
  try {
    info = JSON.parse(scan);
  } catch {
    return null;
  }
  if (move.state !== 'draft') return null;
  const calculated = computeInvoiceTotals(move.invoiceLines, lk.taxes, s.settings.decimals).total;
  const differs = info.total !== null && Math.abs(calculated - info.total) >= 0.5 / 10 ** s.settings.decimals;
  return (
    <Card style={{ borderColor: info.warnings.length || differs ? colors.warning : colors.border }}>
      <Text style={{ fontWeight: '700', fontSize: 15, color: colors.text, marginBottom: space.xs }}>{t('Read from the document')}</Text>
      <Text style={{ color: colors.muted, marginBottom: space.sm }}>{t('Check every field against the paper and correct anything that was misread, then save or confirm.')}</Text>
      {info.total !== null && (
        <>
          <Row label={t('Total on the paper')} value={money(info.total)} />
          <Row label={t('Total calculated by Hisab')} value={money(calculated)} bold valueStyle={differs ? { color: colors.danger } : undefined} />
        </>
      )}
      {differs && <Text style={{ color: colors.danger, marginTop: space.xs }}>{t('The totals differ. Check the amount and the VAT on each line.')}</Text>}
      {info.warnings.map((w, i) => (
        <Text key={i} style={{ color: colors.warning, marginTop: space.xs }}>
          • {t(w.message, w.params)}
        </Text>
      ))}
      {!move.partnerId && info.vendorGuess && can.create && (
        <View style={{ marginTop: space.sm }}>
          <Button
            small
            variant="secondary"
            icon="person-add-outline"
            title={t('Create vendor "{name}"', { name: info.vendorGuess })}
            onPress={() => {
              const id = runWith((st) => {
                const r = addVendorFromReading(st, info.vendorGuess!, info.vatin);
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
