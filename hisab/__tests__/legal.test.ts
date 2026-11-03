import { acceptTerms, needsTermsAcceptance, TERMS_VERSION } from '../src/domain/legal';
import { createCompany } from '../src/domain/template';

const company = () => createCompany({ companyName: 'Test LLC', currency: 'OMR', vatRate: 5, country: 'OM' });

describe('terms of use acceptance', () => {
  it('a new company has not accepted the terms yet', () => {
    expect(needsTermsAcceptance(company())).toBe(true);
  });

  it('records the version, time and who accepted, and writes the audit log', () => {
    const at = new Date('2026-11-03T10:00:00Z');
    const s = acceptTerms(company(), { id: 'u1', name: 'Mohanad (admin)' }, at);
    expect(s.settings.termsAcceptance).toEqual({ version: TERMS_VERSION, acceptedAt: at.toISOString(), acceptedBy: 'Mohanad (admin)' });
    expect(needsTermsAcceptance(s)).toBe(false);
    const entry = s.auditLog[s.auditLog.length - 1];
    expect(entry).toMatchObject({ userId: 'u1', user: 'Mohanad (admin)', action: 'Accepted the Terms of Use and Privacy Policy', ref: TERMS_VERSION });
  });

  it('asks again when the terms change', () => {
    const s = acceptTerms(company(), { name: 'x' });
    const old = { ...s, settings: { ...s.settings, termsAcceptance: { ...s.settings.termsAcceptance!, version: '2000-01-01' } } };
    expect(needsTermsAcceptance(old)).toBe(true);
  });
});
