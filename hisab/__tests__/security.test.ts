// Security checks (docs/SECURITY_REVIEW.md): what a hostile name, file or backup can and cannot do.
import { createDemoCompany } from '../src/domain/seed';
import { invoiceHtml, voucherHtml } from '../src/services/documents';
import { makeBackup, parseCsv, readBackup, toCsv } from '../src/services/files';

const ATTACK = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

describe('documents (XSS)', () => {
  it('print and PDF documents show a hostile customer name as text, never as HTML', () => {
    const s = createDemoCompany();
    const invoice = s.moves.find((m) => m.moveType === 'out_invoice' && m.state === 'posted')!;
    const payment = s.payments[0];
    const hostile = { ...s, partners: s.partners.map((p) => ({ ...p, name: ATTACK, street: ATTACK })), settings: { ...s.settings, companyName: ATTACK } };
    const moveWithRef = { ...invoice, ref: ATTACK, narration: ATTACK, invoiceLines: invoice.invoiceLines.map((l) => ({ ...l, label: ATTACK })) };
    for (const html of [invoiceHtml(hostile, moveWithRef), voucherHtml(hostile, { ...payment, memo: ATTACK })]) {
      expect(html).not.toContain('<script>alert');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    }
  });
});

describe('CSV exports (formula injection)', () => {
  it('a cell that a spreadsheet would run as a formula is exported as plain text', () => {
    const csv = toCsv([
      ['=HYPERLINK("http://evil","click")', '+1+1', '@SUM(A1)', '-2+3', '\tTAB'],
      ['-120.500', -5, 'Normal name', 'A=B', ''],
    ]);
    const [attack, safe] = parseCsv(csv);
    expect(attack).toEqual(["'=HYPERLINK(\"http://evil\",\"click\")", "'+1+1", "'@SUM(A1)", "'-2+3", "'\tTAB"]);
    // Real numbers (also negative ones written as text) are left alone, so amounts still add up.
    expect(safe).toEqual(['-120.500', '-5', 'Normal name', 'A=B', '']);
  });
});

describe('backups', () => {
  const s = createDemoCompany();
  it('restores a real backup', () => {
    expect(readBackup(makeBackup(s)).settings.companyName).toBe(s.settings.companyName);
  });
  it('refuses a backup whose records are not lists', () => {
    const bad = JSON.stringify({ app: 'hisab', format: 1, state: { ...s, moves: { evil: true } } });
    expect(() => readBackup(bad)).toThrow('This file is not a valid Hisab backup.');
  });
  it('refuses a backup carrying a "photo" that is not a JPG or PNG image', () => {
    const bad = JSON.stringify({ app: 'hisab', format: 1, state: { ...s, attachments: [{ id: 'a', ownerId: s.moves[0].id, dataUri: 'data:text/html;base64,PHNjcmlwdD4=', createdAt: '' }] } });
    expect(() => readBackup(bad)).toThrow('This file is not a valid Hisab backup.');
  });
});
