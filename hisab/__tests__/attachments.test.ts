import { diffStates } from '../src/data/persistence';
import { addAttachment, attachmentsFor, MAX_ATTACHMENTS_PER_DOCUMENT, removeAttachment } from '../src/domain/attachments';
import { deleteDraft, newInvoiceLine, newMove, postMove, registerPayment, saveDraft } from '../src/domain/engine';
import { createCompany } from '../src/domain/template';
import { readBackup, makeBackup } from '../src/services/files';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function withBill() {
  const s = createCompany({ companyName: 'Muscat Co', currency: 'OMR', vatRate: 5, country: 'OM' });
  const vendor = { id: 'v1', name: 'Vendor', email: '', phone: '', street: '', city: '', country: '', taxId: '', isCustomer: false, isVendor: true, notes: '', active: true };
  const bill = newMove({ ...s, partners: [vendor] }, 'in_invoice', { partnerId: 'v1', date: '2026-11-01', invoiceLines: [newInvoiceLine({ label: 'Paper', priceUnit: 10 })] });
  return { s: saveDraft({ ...s, partners: [vendor] }, bill), billId: bill.id };
}

it('keeps a receipt photo with its bill, and in backups', () => {
  const { s, billId } = withBill();
  const next = addAttachment(postMove(s, billId), { ownerId: billId, dataUri: PHOTO, createdBy: 'Admin' });
  const [photo] = attachmentsFor(next, billId);
  expect(photo).toMatchObject({ ownerId: billId, dataUri: PHOTO, createdBy: 'Admin' });
  // Saved as its own record, so later changes do not rewrite the photo.
  expect(diffStates(s, next).upserts.filter((u) => u.collection === 'attachments')).toHaveLength(1);
  expect(attachmentsFor(readBackup(makeBackup(next)), billId)).toHaveLength(1);
});

it('attaches a photo to a cash expense', () => {
  const { s } = withBill();
  const cash = s.journals.find((j) => j.type === 'cash')!;
  const expense = s.accounts.find((a) => a.code === '600000')!;
  const { state, payment } = registerPayment(s, { paymentType: 'outbound', partnerType: 'other', amount: 5, date: '2026-11-01', journalId: cash.id, memo: 'Taxi', counterpartAccountId: expense.id });
  expect(attachmentsFor(addAttachment(state, { ownerId: payment.id, dataUri: PHOTO }), payment.id)).toHaveLength(1);
});

it('refuses photos that are not images, too large, too many, or for unsaved documents', () => {
  const { s, billId } = withBill();
  expect(() => addAttachment(s, { ownerId: 'nope', dataUri: PHOTO })).toThrow('Save the document before adding a photo.');
  expect(() => addAttachment(s, { ownerId: billId, dataUri: 'data:application/pdf;base64,AAAA' })).toThrow('Only JPG and PNG photos can be attached.');
  expect(() => addAttachment(s, { ownerId: billId, dataUri: `data:image/jpeg;base64,${'A'.repeat(3_000_000)}` })).toThrow('The photo is too large.');
  let full = s;
  for (let i = 0; i < MAX_ATTACHMENTS_PER_DOCUMENT; i++) full = addAttachment(full, { ownerId: billId, dataUri: PHOTO });
  expect(() => addAttachment(full, { ownerId: billId, dataUri: PHOTO })).toThrow('A document can have up to 10 photos.');
});

it('removes a photo, and the photos of a draft that is deleted', () => {
  const { s, billId } = withBill();
  const one = addAttachment(s, { ownerId: billId, dataUri: PHOTO });
  expect(attachmentsFor(removeAttachment(one, attachmentsFor(one, billId)[0].id), billId)).toEqual([]);
  expect(deleteDraft(one, billId).attachments).toEqual([]);
});
