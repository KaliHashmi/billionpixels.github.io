# Oman legal compliance

What Oman law requires of an accounting app, and how Hisab meets it. Review this file whenever a rule changes and before every store release.

**Last reviewed:** 2 November 2026.

**Status:** Hisab is software that helps a business keep its books. It is **not** approved by the Oman Tax Authority (OTA) and does not file anything for the user. The business remains responsible for its returns and records.

> Sources are listed at the end. Several are secondary (law firms, consultancies), and some conflict. Items marked **Confirm** must be checked against the official Arabic text (Official Gazette, taxoman.gov.om, spf.gov.om) or with a licensed Omani tax adviser before launch.

---

## 1. VAT records: issued documents are never erased

| Rule | Law | Hisab |
|---|---|---|
| Keep tax invoices, credit notes and accounting records for **10 years**, available to the OTA (in Arabic on request) | VAT Law (RD 121/2020) and Executive Regulations | No numbered document can be deleted. `deleteMove` only erases drafts that were never numbered. An automated stress test fails if any numbered document ever disappears |
| Correct an issued tax invoice **only with a tax credit/debit note** that references the original and states the reason | Exec. Regs (credit note articles) | Issued sales invoices and credit notes cannot go back to draft. **Correct** = full credit note (reason required) + a new draft that gets its own number. **Cancel with Credit Note** is available to accountants and admins |
| Deliberately not issuing or keeping invoices is an offence | VAT Law Art. 100: fine OMR 1,000–10,000 and/or 2 months–1 year prison | As above. Bills, entries, vouchers, payroll and VAT closings are **cancelled** (kept, marked cancelled) instead of deleted. Undoing a bank match, a cheque clearance or a cash day cancels its entry rather than erasing it |
| Sequential, unique invoice numbers | Exec. Regs | One sequence per journal and year (`INV/2026/00001`). Numbers are never reused, and with deletion removed there are no gaps |
| Audit trail | OTA expects records to link to the VAT return | **Audit Log** (admins): every cancellation, correction, edit of an issued bill, entry, voucher or payroll, and every user deletion, with user and time. Entries cannot be edited and are included in backups |
| VAT period closed after filing | Good practice / OTA audit | The VAT closing sets a tax lock date. Cancelling a closing warns that a filed return must be corrected with the OTA (voluntary disclosure) |

## 2. Tax invoice and credit note content

| Required | Hisab |
|---|---|
| Words "Tax Invoice" / "Tax Credit Note" | ✅ English and Arabic title |
| Supplier name, address and VATIN | ✅ Settings. The app warns when an Omani VATIN doesn't match `OM` + 10 digits |
| Customer name, address and VATIN (when registered) | ✅ From the contact |
| Sequential number, date of issue | ✅ |
| Date of supply, when different from the issue date | ✅ Optional **Date of Supply** field, printed when it differs |
| Description, quantity, unit price, taxable amount, VAT rate and VAT amount per line, totals with and without VAT, in OMR | ✅ |
| Credit note: original invoice number and date, and the reason | ✅ The reason is mandatory for sales credit notes |
| Drafts must not look like tax invoices | ✅ Draft PDFs are titled "Draft … – not a tax document" |
| Cancelled or credited invoices are clearly marked | ✅ "CANCELLED" / "CREDITED" with the credit note number |
| Arabic | ✅ Every document is bilingual (English and Arabic). The OTA may ask for Arabic |
| Issue within **15 days** of the supply (amended Art. 143) | ⚠️ The business's responsibility. **Confirm**: some sources say 14 days |

## 3. E-invoicing (Fawtara)

- **Rule:** Decision 189/2026 amends the VAT Executive Regulations. Invoices must be issued in an approved electronic format (Peppol, PINT-OM) through an OTA-approved provider:
  - from **1 April 2027** for annual supplies above OMR 5 million;
  - from **1 October 2027** for all other VAT-registered businesses;
  - the pilot group selected by the OTA started in August 2026.
- **Hisab today:** not an approved e-invoicing provider. Settings shows this warning to Omani VAT-registered companies.
- **To do before October 2027:** integrate with an approved Fawtara provider (export invoices as PINT-OM UBL, receive the clearance ID and QR code), or stop issuing tax invoices from Hisab for businesses in scope.
- **Confirm:** each customer's phase using the OTA's rollout checker.

## 4. Payroll: Social Protection Fund

| Item | Default in Hisab (new companies) | Notes |
|---|---|---|
| Omani employee | 8% | Pension and job security |
| Omani employer | 14.5% | Includes the 1% sick-leave branch from 19 July 2026. **Confirm**: older sources say 13.5% |
| Expatriate employer | 2% | Maternity 1% (since July 2024) + sick leave 1% (from 19 July 2026, for the categories in Ministerial Decision 13/2026). **Confirm**: the work-injury start date for expatriates is disputed (some sources say July 2028) |
| Contribution wage ceiling | OMR 3,000 per month | |
| Expatriate savings scheme (9%, replaces gratuity) | Not implemented | Postponed to July 2027 (RD 60/2025) |

- **Where users change them:** every rate and the ceiling are editable in Settings › Payroll, with "Rates last checked" and an "I have confirmed these rates today" button. Existing companies keep their saved rates and see a warning until confirmed.
- **Basis:** Hisab uses gross salary (basic + allowances) up to the ceiling. **Confirm** which allowances count as "contribution wage" for your workforce.
- **End-of-service gratuity** (Labour Law RD 53/2023: at least one month of basic wage per year for contracts under the new law; tiered for older contracts) is **not calculated** by Hisab. Track it outside the app, or add it before marketing payroll as complete.
- **Overtime:** entered as an amount; Hisab doesn't apply rates. **WPS:** Hisab stores bank and IBAN details but does not produce a WPS file.

## 5. Personal data (PDPL, RD 6/2022 as amended by RD 68/2026; Exec. Reg. MD 34/2024)

- **Hisab as the publisher:**
  - collects no personal data and has no servers;
  - the privacy policy says so;
  - no analytics, no tracking, no third-party fonts, scripts or AI;
  - no cross-border transfer.
- **The user's business is the controller** for the employee and customer data it enters (names, IBANs, salaries, VATINs). The privacy policy reminds them of this. They must have a lawful basis, keep the data secure, and delete it once its purpose ends: RD 68/2026 adds a deletion duty, but accounting retention (10 years) is a legal reason to keep financial records.
- **Marketing:** RD 68/2026 requires explicit consent before sending marketing. Hisab sends none.
- **Penalties:** administrative fines up to OMR 2,000 per violation; separate criminal fines (**Confirm** amounts).

## 6. Other laws touched by the app

| Topic | Position |
|---|---|
| Electronic Transactions Law (RD 69/2008) | The drawn or uploaded "authorised signature" is an image on a PDF, **not** a certified electronic signature. Hisab never calls it one |
| Commercial Law (RD 55/1990) | Merchants keep books. Same 10-year retention approach as VAT |
| Corporate income tax | Not calculated. Reports are management reports, not tax returns |
| Publisher | Publishing in the App Store or Google Play under an organisation needs the company's Commercial Registration (and a D-U-N-S number). If the app is sold, it needs a matching commercial activity, and the sale terms must follow the Consumer Protection Law |

## 7. Launch checklist (legal)

- [ ] A licensed Omani tax adviser reviews sections 1–4 against the Arabic texts (an hour's review is cheap insurance).
- [ ] Confirm SPF rates on spf.gov.om and update `SI_RATES_CHECKED_ON` in `src/domain/template.ts`.
- [ ] Store listing and website say "helps you keep Oman-compliant records". They must not say "OTA approved" or "Fawtara certified".
- [ ] Fawtara integration planned before 1 October 2027.
- [ ] Support email published on the privacy and support pages.

---

## Sources

**VAT and e-invoicing**
- [Oman Observer: phased mandatory e-invoicing](https://www.omanobserver.om/article/1194374/business/economy/oman-sets-phased-mandatory-e-invoicing-regime)
- [Sanad: Decision 189/2026 and the OMR 5m threshold](https://sanadservice.com/en/guides/e-invoicing-oman/)
- [e-invoice.app: Decision 189/2026 dates](https://www.e-invoice.app/blog/oman-decision-189-2026-e-invoicing-dates)
- [Arabian Business: VAT rules amended ahead of 2027](https://www.arabianbusiness.com/finance/oman-vat-rules-2027-rollout)
- [RTC Suite: e-invoicing dates and 15-day rule](https://rtcsuite.com/e-invoicing-oman/)
- [Flick: credit notes under Oman VAT](https://www.flick.network/en-om/credit-note-compliance-oman)
- [Tally: credit and debit notes](https://tallysolutions.com/mena/oman-vat/credit-note-and-debit-note-in-oman-vat/)
- [OTA: VAT Law and Executive Regulations](https://tms.taxoman.gov.om/portal/documents/20126/1414820/VAT+Law+.pdf/9cbe8926-066b-d48d-2b7f-14f41b4c19a8?t=1733169733344)
- [Arabian Stories: VAT penalties](https://www.thearabianstories.com/2026/08/13/tas-exclusive-oman-businesses-face-vat-penalties-for-non-compliance-with-new-e-invoicing-rules/)
- [Invoice requirements summary](https://invoicedataextraction.com/blog/oman-vat-invoice-requirements)

**Social protection and labour**
- [Gulf News: sick leave insurance from 19 July 2026](https://gulfnews.com/world/gulf/oman/oman-rolls-out-sick-leave-insurance-scheme-from-july-19-1.500610430)
- [Sanad: 2026 contribution rates by branch](https://sanadservice.com/en/guides/social-insurance-oman/)
- [SmartPRO: PASI / SPF](https://thesmartpro.io/pasi-oman)
- [Gulf Business: gratuity rules clarified](https://gulfbusiness.com/en/2026/oman/oman-clarifies-end-of-service-gratuity-rules-in-key-labour-update/)
- [Oman Observer: gratuity clarification](https://www.omanobserver.om/article/1194067/oman/labour/labour-ministry-clarifies-end-of-service-gratuity)

**Personal data**
- [decree.om: PDPL consolidated](https://decree.om/2022/l20220006/)
- [CMS: Oman updates its PDPL](https://cms.law/en/omn/legal-updates/oman-updates-its-personal-data-protection-law)
- [Global Law Experts: RD 68/2026](https://globallawexperts.com/omans-royal-decree-68-2026-amends/)
- [MTCIT: personal data protection](https://mtcit.gov.om/sectors/governance/personal)
