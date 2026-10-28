import { Stack } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useBooks, useStore } from '../data/store';
import { isAdmin } from '../domain/auth';
import { generatedStampSvg, Point, signatureSvg, stampSource, svgDataUri, svgFromDataUri } from '../domain/branding';
import { Settings } from '../domain/types';
import { useT } from '../i18n';
import { invoiceHtml } from '../services/documents';
import { pickImage, sharePdf } from '../services/files';
import { Button, ButtonRow, Card, EmptyState, Screen, SectionTitle } from '../ui/components';
import { notify } from '../ui/dialog';
import { Segmented, SwitchField, TextField } from '../ui/fields';
import { SignaturePad } from '../ui/SignaturePad';
import { colors, space } from '../ui/theme';

type Branding = Pick<Settings, 'stampMode' | 'stampImage' | 'signatureImage' | 'signatoryName' | 'signatoryTitle' | 'brandSales' | 'brandVouchers' | 'brandPurchases' | 'brandReports' | 'brandDrafts'>;
type SignatureMode = 'none' | 'draw' | 'image';

/** Shows an image data URI; SVG sources are drawn with react-native-svg. */
function Picture({ uri, width, height }: { uri: string; width: number; height: number }) {
  const svg = svgFromDataUri(uri);
  if (svg) return <SvgXml xml={svg} width={width} height={height} />;
  return <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />;
}

export default function StampScreen() {
  const s = useBooks();
  const { run, user } = useStore();
  const { t } = useT();
  const c = s.settings;
  const [form, setForm] = useState<Branding>({
    stampMode: c.stampMode ?? 'generated',
    stampImage: c.stampImage,
    signatureImage: c.signatureImage,
    signatoryName: c.signatoryName ?? '',
    signatoryTitle: c.signatoryTitle ?? '',
    brandSales: c.brandSales ?? true,
    brandVouchers: c.brandVouchers ?? true,
    brandPurchases: c.brandPurchases ?? true,
    brandReports: c.brandReports ?? true,
    brandDrafts: c.brandDrafts ?? true,
  });
  const set = (patch: Partial<Branding>) => setForm((f) => ({ ...f, ...patch }));
  const [sigMode, setSigMode] = useState<SignatureMode>(!c.signatureImage ? 'none' : svgFromDataUri(c.signatureImage) ? 'draw' : 'image');
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const preview = { ...c, ...form };
  const stamp = stampSource(preview);

  const choose = async (field: 'stampImage' | 'signatureImage') => {
    try {
      const uri = await pickImage();
      if (uri) set({ [field]: uri });
    } catch (e) {
      notify(t('Could not open the image'), t(e instanceof Error ? e.message : String(e)));
    }
  };

  const drawn = (next: Point[][]) => {
    setStrokes(next);
    const svg = signatureSvg(next);
    set({ signatureImage: svg ? svgDataUri(svg) : undefined });
  };

  const changeSigMode = (m: SignatureMode) => {
    setSigMode(m);
    setStrokes([]);
    // Keep the existing signature only if it matches the chosen kind.
    const current = form.signatureImage;
    const isDrawn = !!current && !!svgFromDataUri(current);
    if (m === 'none' || (m === 'draw' && !isDrawn) || (m === 'image' && isDrawn)) set({ signatureImage: undefined });
  };

  const save = () => {
    if (form.stampMode === 'image' && !form.stampImage) return notify(t('Missing field'), t('Choose an image of your stamp, or pick another stamp option.'));
    if (sigMode !== 'none' && !form.signatureImage) return notify(t('Missing field'), t('Draw or upload the signature, or choose "None".'));
    const patch: Branding = {
      ...form,
      stampImage: form.stampMode === 'image' ? form.stampImage : undefined,
      signatureImage: sigMode === 'none' ? undefined : form.signatureImage,
      signatoryName: form.signatoryName?.trim() || undefined,
      signatoryTitle: form.signatoryTitle?.trim() || undefined,
    };
    if (run((st) => ({ ...st, settings: { ...st.settings, ...patch } }))) notify(t('Saved'), t('Every PDF and printout will now carry this stamp and signature.'));
  };

  const sample = s.moves
    .filter((m) => m.state === 'posted' && (m.moveType === 'out_invoice' || m.moveType === 'out_refund'))
    .sort((a, b) => (b.invoiceDate ?? b.date).localeCompare(a.invoiceDate ?? a.date))[0];
  const samplePdf = () => {
    if (!sample) return notify(t('No invoices yet'), t('Post a sales invoice first, then try again.'));
    sharePdf(invoiceHtml({ ...s, settings: { ...preview, signatureImage: sigMode === 'none' ? undefined : form.signatureImage } }, sample), `${sample.name.replace(/\//g, '-')}-sample`).catch((e) =>
      notify(t('Export failed'), String(e)),
    );
  };

  if (!isAdmin(user?.role)) return <EmptyState icon="lock-closed-outline" title={t('Administrators only')} />;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Stamp & Signature') }} />
      <Card>
        <SectionTitle>{t('Preview')}</SectionTitle>
        <Text style={st.hint}>{t('This block is printed at the bottom of every PDF and printout: invoices, bills, credit notes, vouchers, reports and reminders.')}</Text>
        <View style={st.previewWrap}>
          <View style={st.previewArt}>
            {stamp ? (
              <View style={st.stamp}>
                <Picture uri={stamp} width={124} height={124} />
              </View>
            ) : null}
            {sigMode !== 'none' && form.signatureImage ? (
              <View style={st.signature}>
                <Picture uri={form.signatureImage} width={160} height={70} />
              </View>
            ) : null}
          </View>
          {form.signatoryName ? (
            <Text style={st.name}>
              {form.signatoryName}
              {form.signatoryTitle ? ` – ${form.signatoryTitle}` : ''}
            </Text>
          ) : null}
          <Text style={st.caption}>Authorized Signature & Stamp · التوقيع والختم المعتمد</Text>
        </View>
        <ButtonRow>
          <Button small variant="secondary" icon="download-outline" title={t('Sample invoice PDF')} onPress={samplePdf} />
        </ButtonRow>
      </Card>

      <Card>
        <SectionTitle>{t('Company Stamp')}</SectionTitle>
        <Text style={{ height: space.sm }} />
        <Segmented
          value={form.stampMode ?? 'none'}
          onChange={(v) => set({ stampMode: v })}
          options={[
            { value: 'none', label: t('None') },
            { value: 'generated', label: t('Generate') },
            { value: 'image', label: t('Upload') },
          ]}
        />
        {form.stampMode === 'generated' && (
          <>
            <Text style={st.hint}>{t('A round stamp made from your company name, Arabic name, country and VATIN (change them in Settings).')}</Text>
            <View style={st.center}>
              <SvgXml xml={generatedStampSvg(c)} width={150} height={150} />
            </View>
          </>
        )}
        {form.stampMode === 'image' && (
          <>
            <Text style={st.hint}>{t('Photograph or scan your real stamp on white paper. A PNG with a transparent background looks best.')}</Text>
            {form.stampImage ? (
              <View style={st.center}>
                <Picture uri={form.stampImage} width={150} height={150} />
              </View>
            ) : null}
            <ButtonRow>
              <Button small variant="secondary" icon="image-outline" title={form.stampImage ? t('Change image') : t('Choose image')} onPress={() => choose('stampImage')} />
            </ButtonRow>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>{t('Authorized Signature')}</SectionTitle>
        <Text style={{ height: space.sm }} />
        <Segmented
          value={sigMode}
          onChange={changeSigMode}
          options={[
            { value: 'none', label: t('None') },
            { value: 'draw', label: t('Draw') },
            { value: 'image', label: t('Upload') },
          ]}
        />
        {sigMode === 'draw' && (
          <>
            <Text style={st.hint}>{t('Sign inside the box with your finger or mouse.')}</Text>
            {strokes.length === 0 && form.signatureImage ? (
              <View style={st.center}>
                <Picture uri={form.signatureImage} width={200} height={80} />
                <Text style={st.hint}>{t('Current signature. Draw below to replace it.')}</Text>
              </View>
            ) : null}
            <SignaturePad strokes={strokes} onChange={drawn} />
            <ButtonRow>
              <Button small variant="secondary" icon="arrow-undo-outline" title={t('Undo')} disabled={!strokes.length} onPress={() => drawn(strokes.slice(0, -1))} />
              <Button small variant="secondary" icon="trash-outline" title={t('Clear')} onPress={() => drawn([])} />
            </ButtonRow>
          </>
        )}
        {sigMode === 'image' && (
          <>
            <Text style={st.hint}>{t('Sign on white paper, take a clear photo and crop it close to the signature.')}</Text>
            {form.signatureImage ? (
              <View style={st.center}>
                <Picture uri={form.signatureImage} width={200} height={80} />
              </View>
            ) : null}
            <ButtonRow>
              <Button small variant="secondary" icon="image-outline" title={form.signatureImage ? t('Change image') : t('Choose image')} onPress={() => choose('signatureImage')} />
            </ButtonRow>
          </>
        )}
        <TextField label={t('Signatory Name')} value={form.signatoryName ?? ''} onChange={(v) => set({ signatoryName: v })} />
        <TextField label={t('Position')} value={form.signatoryTitle ?? ''} onChange={(v) => set({ signatoryTitle: v })} placeholder={t('e.g. General Manager')} />
      </Card>

      <Card>
        <SectionTitle>{t('Print On')}</SectionTitle>
        <SwitchField label={t('Sales invoices & credit notes')} value={!!form.brandSales} onChange={(v) => set({ brandSales: v })} />
        <SwitchField label={t('Receipt & payment vouchers')} value={!!form.brandVouchers} onChange={(v) => set({ brandVouchers: v })} />
        <SwitchField label={t('Purchase invoices')} value={!!form.brandPurchases} onChange={(v) => set({ brandPurchases: v })} />
        <SwitchField label={t('Reports, VAT return and reminders')} value={!!form.brandReports} onChange={(v) => set({ brandReports: v })} />
        <SwitchField label={t('Draft documents')} value={!!form.brandDrafts} onChange={(v) => set({ brandDrafts: v })} hint={t('Turn off to stamp only posted documents.')} />
      </Card>

      <Button title={t('Save')} icon="checkmark" onPress={save} />
    </Screen>
  );
}

const st = StyleSheet.create({
  hint: { color: colors.muted, marginVertical: space.sm },
  center: { alignItems: 'center', marginVertical: space.sm },
  previewWrap: { alignSelf: 'center', width: 260, alignItems: 'center', marginVertical: space.sm },
  previewArt: { width: 250, height: 132, borderBottomWidth: 1, borderColor: colors.text },
  stamp: { position: 'absolute', left: 0, top: 4 },
  signature: { position: 'absolute', right: 6, bottom: 6 },
  name: { fontWeight: '600', marginTop: 4, color: colors.text },
  caption: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
