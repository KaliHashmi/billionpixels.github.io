// Photos of paper receipts and supplier invoices, kept with the bill or payment they belong to.
import { AccountingError, AppState, Attachment, ID } from './types';
import { newId } from './utils';

/** A reduced phone photo is about 200–400 KB; this limit stops a full-size image filling the books. */
export const MAX_ATTACHMENT_CHARS = 2_500_000;
export const MAX_ATTACHMENTS_PER_DOCUMENT = 10;

export function attachmentsFor(state: AppState, ownerId: ID): Attachment[] {
  return (state.attachments ?? []).filter((a) => a.ownerId === ownerId);
}

export function addAttachment(state: AppState, input: { ownerId: ID; dataUri: string; createdBy?: string }): AppState {
  const owner = state.moves.some((m) => m.id === input.ownerId) || state.payments.some((p) => p.id === input.ownerId);
  if (!owner) throw new AccountingError('Save the document before adding a photo.');
  if (!/^data:image\/(jpeg|png);base64,/.test(input.dataUri)) throw new AccountingError('Only JPG and PNG photos can be attached.');
  if (input.dataUri.length > MAX_ATTACHMENT_CHARS) throw new AccountingError('The photo is too large.');
  if (attachmentsFor(state, input.ownerId).length >= MAX_ATTACHMENTS_PER_DOCUMENT) throw new AccountingError('A document can have up to 10 photos.');
  const attachment: Attachment = { id: newId(), ownerId: input.ownerId, dataUri: input.dataUri, createdAt: new Date().toISOString(), createdBy: input.createdBy };
  return { ...state, attachments: [...(state.attachments ?? []), attachment] };
}

export function removeAttachment(state: AppState, id: ID): AppState {
  if (!(state.attachments ?? []).some((a) => a.id === id)) throw new AccountingError('This photo was already removed.');
  return { ...state, attachments: state.attachments.filter((a) => a.id !== id) };
}
