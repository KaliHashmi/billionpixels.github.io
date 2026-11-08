import { AppState, ID } from './types';
import { newId } from './utils';

/** Date of the current Terms of Use and Privacy Policy (`site/terms.html`, `site/privacy.html`). Change it when either changes. */
export const TERMS_VERSION = '2026-11-08';

/** True until an administrator accepts the current terms for this company. */
export function needsTermsAcceptance(state: AppState): boolean {
  return state.settings.termsAcceptance?.version !== TERMS_VERSION;
}

/** Records who accepted the current terms and when, in the settings and the audit log. */
export function acceptTerms(state: AppState, by: { id?: ID; name: string }, now = new Date()): AppState {
  const acceptedAt = now.toISOString();
  return {
    ...state,
    settings: { ...state.settings, termsAcceptance: { version: TERMS_VERSION, acceptedAt, acceptedBy: by.name } },
    auditLog: [
      ...(state.auditLog ?? []),
      { id: newId(), at: acceptedAt, userId: by.id, user: by.name, action: 'Accepted the Terms of Use and Privacy Policy', ref: TERMS_VERSION },
    ],
  };
}
