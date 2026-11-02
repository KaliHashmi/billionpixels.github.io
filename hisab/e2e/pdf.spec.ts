import { expect, test } from '@playwright/test';
import { demoSignIn, expectNoErrors, openPostedInvoice, watchErrors } from './helpers';

test('an invoice downloads as a PDF', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  await openPostedInvoice(page);
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByText('Download PDF').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^INV-\d{4}-\d+.*\.pdf$/);
  const [first] = (await (await file.createReadStream()).toArray()) as Uint8Array[];
  expect(new TextDecoder().decode(first.subarray(0, 5))).toBe('%PDF-');
  await expectNoErrors(page, errors);
});
