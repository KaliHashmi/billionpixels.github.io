import { useCallback, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBooks, usePermissions, useStore } from '../data/store';
import { addAttachment, attachmentsFor, removeAttachment } from '../domain/attachments';
import { isAccountingDocument, readReceipt, RECEIPT_MESSAGES } from '../domain/receiptReader';
import { Attachment, ID } from '../domain/types';
import { useT } from '../i18n';
import { pickReceiptPhoto } from '../services/files';
import { Button, ButtonRow, Card, SectionTitle } from '../ui/components';
import { confirm, notify } from '../ui/dialog';
import { colors, radius, space } from '../ui/theme';
import DocumentReader, { ReaderResult } from './DocumentReader';

/**
 * Photos of the paper receipt or supplier invoice behind a bill or payment voucher.
 * `ownerId` is undefined until the document has been saved. `docName` names it in the audit log.
 * Every photo is read on the device first and kept only if it is a bill, receipt or credit note;
 * an administrator may still attach one Hisab cannot read (handwritten or faded), recorded in the audit log.
 */
export function ReceiptPhotos({ ownerId, docName }: { ownerId?: ID; docName: string }) {
  const s = useBooks();
  const { run, user } = useStore();
  const can = usePermissions();
  const { t } = useT();
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [checking, setChecking] = useState<{ dataUri: string; mimeType: string } | null>(null);
  const photos = ownerId ? attachmentsFor(s, ownerId) : [];

  const add = async (source: 'camera' | 'library') => {
    if (!ownerId || checking) return;
    try {
      const dataUri = await pickReceiptPhoto(source);
      if (dataUri) setChecking({ dataUri, mimeType: 'image/jpeg' });
    } catch (e) {
      notify(t('Could not open the image'), t(e instanceof Error ? e.message : String(e)));
    }
  };

  /** The photo has been read (text null: it could not be read at all). */
  const checked = useCallback(
    async (text: string | null) => {
      const photo = checking;
      setChecking(null);
      if (!photo || !ownerId) return;
      const attach = (st: typeof s) => addAttachment(st, { ownerId, dataUri: photo.dataUri, createdBy: user?.name });
      if (text !== null && isAccountingDocument(text, readReceipt(s, text))) {
        run(attach, { audit: { action: 'Added a receipt photo', ref: docName } });
        return;
      }
      if (!can.editDocuments) {
        notify(t('Photo not added'), `${t(RECEIPT_MESSAGES.notAccounting)} ${t('Ask an administrator to attach a handwritten or faded receipt.')}`);
        return;
      }
      const ok = await confirm(
        t('Attach anyway?'),
        `${t(RECEIPT_MESSAGES.notAccounting)} ${t('Attach it only if it is a handwritten or faded receipt. This is recorded in the audit log.')}`,
        t('Attach anyway'),
      );
      // Administrators only: the store checks the role again.
      if (ok) run(attach, { requires: 'editDocuments', audit: { action: 'Added a receipt photo that Hisab could not read', ref: docName } });
    },
    [can.editDocuments, checking, docName, ownerId, run, s, t, user?.name],
  );
  const onResult = useCallback((r: ReaderResult) => checked(r.text), [checked]);
  const onError = useCallback(() => checked(null), [checked]);
  const onProgress = useCallback(async () => undefined, []);

  const remove = async (photo: Attachment) => {
    if (!(await confirm(t('Remove photo'), t('Remove this photo from {name}? Keep the paper original: Oman law requires records to be kept for 10 years.', { name: docName }), t('Remove'), true))) return;
    if (run((st) => removeAttachment(st, photo.id), { requires: 'deleteDocuments', audit: { action: 'Removed a receipt photo', ref: docName } })) setViewing(null);
  };

  return (
    <Card>
      <SectionTitle>{t('Receipt Photos')}</SectionTitle>
      {!ownerId ? (
        <Text style={st.hint}>{t('Save the document first, then add a photo of the paper receipt.')}</Text>
      ) : (
        <>
          {photos.length === 0 && <Text style={st.hint}>{t('No photo yet. Photograph the paper receipt or supplier invoice to keep it with this record.')}</Text>}
          {photos.length > 0 && (
            <ScrollView horizontal contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}>
              {photos.map((p, i) => (
                <Pressable key={p.id} accessibilityRole="imagebutton" accessibilityLabel={t('Receipt photo {n}', { n: i + 1 })} onPress={() => setViewing(p)} testID="receipt-thumb">
                  <Image source={{ uri: p.dataUri }} style={st.thumb} />
                </Pressable>
              ))}
            </ScrollView>
          )}
          {checking && <Text style={st.hint}>{t('Checking the photo…')}</Text>}
          {can.create && !checking && (
            <ButtonRow>
              <Button small variant="secondary" title={t('Take Photo')} icon="camera-outline" onPress={() => add('camera')} />
              <Button small variant="secondary" title={t('Choose Photo')} icon="images-outline" onPress={() => add('library')} />
            </ButtonRow>
          )}
        </>
      )}
      <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={st.viewer}>
          {viewing && <Image source={{ uri: viewing.dataUri }} style={st.full} resizeMode="contain" accessibilityLabel={t('Receipt Photos')} />}
          <ButtonRow>
            {viewing && can.deleteDocuments && <Button small variant="danger" title={t('Remove')} icon="trash-outline" onPress={() => remove(viewing)} />}
            <Button small variant="secondary" title={t('Close')} icon="close" onPress={() => setViewing(null)} />
          </ButtonRow>
        </View>
      </Modal>
      {checking && <DocumentReader source={checking} onResult={onResult} onError={onError} onProgress={onProgress} dom={{ style: { width: 1, height: 1, position: 'absolute' }, scrollEnabled: false }} />}
    </Card>
  );
}

const st = StyleSheet.create({
  hint: { color: colors.muted, fontSize: 13, marginBottom: space.sm },
  thumb: { width: 76, height: 76, borderRadius: radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  viewer: { flex: 1, backgroundColor: '#000', padding: space.lg, paddingTop: 56, gap: space.md },
  full: { flex: 1, width: '100%' },
});
