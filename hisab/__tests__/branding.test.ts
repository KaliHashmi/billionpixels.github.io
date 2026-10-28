import { documentBranding, generatedStampSvg, signatureSvg, svgDataUri, svgFromDataUri, toBase64 } from '../src/domain/branding';
import { createDemoCompany } from '../src/domain/seed';
import { invoiceHtml, voucherHtml } from '../src/services/documents';

describe('stamp and signature', () => {
  const s = createDemoCompany();
  const posted = s.moves.find((m) => m.moveType === 'out_invoice' && m.state === 'posted')!;
  const bill = s.moves.find((m) => m.moveType === 'in_invoice' && m.state === 'posted')!;

  it('prints on issued sales invoices and vouchers but not on drafts or purchase invoices by default', () => {
    expect(invoiceHtml(s, posted)).toContain('class="stamp"');
    expect(invoiceHtml(s, posted)).toContain('class="signature"');
    expect(invoiceHtml(s, posted)).toContain('Ahmed Al Balushi');
    expect(invoiceHtml(s, { ...posted, state: 'draft' })).not.toContain('class="seal"');
    expect(invoiceHtml(s, bill)).not.toContain('class="seal"');
    const withPurchases = { ...s, settings: { ...s.settings, brandPurchases: true } };
    expect(invoiceHtml(withPurchases, bill)).toContain('class="seal"');
    expect(voucherHtml(s, s.payments.find((p) => p.state === 'posted')!)).toContain('class="seal"');
  });

  it('prints nothing when no stamp or signature is set up, or the document type is switched off', () => {
    expect(documentBranding({ ...s.settings, stampMode: 'none', signatureImage: undefined }, 'sales')).toBeUndefined();
    expect(documentBranding({ ...s.settings, brandSales: false }, 'sales')).toBeUndefined();
    expect(documentBranding({ ...s.settings, stampMode: 'image', stampImage: undefined, signatureImage: undefined }, 'vouchers')).toBeUndefined();
  });

  it('draws the stamp from the company details', () => {
    const svg = generatedStampSvg(s.settings);
    expect(svg).toContain('HISAB DEMO TRADING LLC');
    expect(svg).toContain('SULTANATE OF OMAN');
    expect(svg).toContain('سلطنة عُمان');
    expect(svg).toContain('OM1100000000');
    expect(generatedStampSvg({ ...s.settings, companyName: 'A & <B>' })).toContain('A &amp; &lt;B&gt;');
    expect(svgFromDataUri(svgDataUri(svg))).toBe(svg);
  });

  it('crops a drawn signature to the ink', () => {
    expect(signatureSvg([])).toBeUndefined();
    const svg = signatureSvg([[[100, 50], [140, 70]], [[120, 90]]])!;
    expect(svg).toContain('viewBox="0 0 52 52"');
    expect(svg).toContain('M6 6L46 26M26 46l0.1 0');
  });

  it('encodes base64 like the platform does', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'stamp ✓ ختم']) {
      const bytes = new TextEncoder().encode(text);
      expect(toBase64(bytes)).toBe(btoa(String.fromCharCode(...bytes)));
    }
  });
});
