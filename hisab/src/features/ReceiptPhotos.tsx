import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBooks, usePermissions, useStore } from '../data/store';
import { addAttachment, attachmentsFor, removeAttachment } from '../domain/attachments';
import { Attachment, ID } from '../domain/types';
import { useT } from '../i18n';
import { pickReceiptPhoto } from '../services/files';
import { Button, ButtonRow, Card, SectionTitle } from '../ui/components';
import { confirm, notify } from '../ui/dialog';
import { colors, radius, space } from '../ui/theme';

/**
 * Photos of the paper receipt or supplier invoice behind a bill or payment voucher.
 * `ownerId` is undefined until the document has been saved. `docName` names it in the audit log.
 */
export function ReceiptPhotos({ ownerId, docName }: { ownerId?: ID; docName: string }) {
  const s = useBooks();
  const { run, user } = useStore();
  const can = usePermissions();
  const { t } = useT();
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const photos = ownerId ? attachmentsFor(s, ownerId) : [];

  const add = async (source: 'camera' | 'library') => {
    if (!ownerId) return;
    try {
      const dataUri = await pickReceiptPhoto(source);
      if (!dataUri) return;
      run((st) => addAttachment(st, { ownerId, dataUri, createdBy: user?.name }), { audit: { action: 'Added a receipt photo', ref: docName } });
    } catch (e) {
      notify(t('Could not open the image'), t(e instanceof Error ? e.message : String(e)));
    }
  };

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
          {can.create && (
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
    </Card>
  );
}

const st = StyleSheet.create({
  hint: { color: colors.muted, fontSize: 13, marginBottom: space.sm },
  thumb: { width: 76, height: 76, borderRadius: radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  viewer: { flex: 1, backgroundColor: '#000', padding: space.lg, paddingTop: 56, gap: space.md },
  full: { flex: 1, width: '100%' },
});
