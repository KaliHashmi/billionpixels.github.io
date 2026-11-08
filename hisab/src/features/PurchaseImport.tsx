import { useBooks, useMoney, usePermissions, useStore } from '../data/store';
import { ImportMessage, importPurchases, planPurchaseImport, purchaseTemplateRows } from '../domain/purchaseImport';
import { useT } from '../i18n';
import { parseCsv, pickTextFile, shareTextFile, toCsv } from '../services/files';
import { Button, ButtonRow } from '../ui/components';
import { confirm, notify } from '../ui/dialog';

const SHOWN_ERRORS = 8;

/** "Import CSV" and "Template" buttons for purchase bills and cash expenses (shown to users who may create documents). */
export function PurchaseImportButtons() {
  const s = useBooks();
  const { run } = useStore();
  const can = usePermissions();
  const money = useMoney();
  const { t } = useT();
  if (!can.create) return null;

  const describe = (errors: ImportMessage[]) =>
    errors
      .slice(0, SHOWN_ERRORS)
      .map((e) => `${t('Row {row}', { row: e.row })}: ${t(e.message, e.params)}`)
      .concat(errors.length > SHOWN_ERRORS ? [t('…and {count} more.', { count: errors.length - SHOWN_ERRORS })] : [])
      .join('\n');

  const downloadTemplate = () =>
    shareTextFile('hisab-purchases-template.csv', toCsv(purchaseTemplateRows()), 'text/csv').catch((e) => notify(t('Export failed'), String(e)));

  const importFile = async () => {
    try {
      const text = await pickTextFile(['text/csv', 'text/comma-separated-values', 'text/plain', '*/*']);
      if (!text) return;
      const plan = planPurchaseImport(s, parseCsv(text));
      if (!plan.rows.length) return notify(t('Nothing to import'), describe(plan.errors));
      const bills = plan.rows.filter((r) => r.type === 'bill').length;
      const total = plan.rows.reduce((x, r) => x + r.amount, 0);
      const summary = t('{bills} bill(s) and {expenses} expense(s), {total} before VAT. Bills are confirmed and numbered; expenses are recorded as payment vouchers.', {
        bills,
        expenses: plan.rows.length - bills,
        total: money(total),
      });
      const skipped = plan.errors.length ? `\n\n${t('{count} row(s) will be skipped:', { count: plan.errors.length })}\n${describe(plan.errors)}` : '';
      if (!(await confirm(t('Import purchases'), summary + skipped, t('Import')))) return;
      let result: ReturnType<typeof importPurchases> | undefined;
      run(
        (st) => {
          result = importPurchases(st, plan.rows);
          return result.state;
        },
        { audit: { action: 'Imported purchases from a CSV file', ref: t('{bills} bill(s) and {expenses} expense(s)', { bills, expenses: plan.rows.length - bills }) } },
      );
      if (!result) return;
      const refused = result.errors.length ? `\n\n${t('{count} row(s) could not be posted:', { count: result.errors.length })}\n${describe(result.errors)}` : '';
      notify(t('Import finished'), t('{bills} bill(s) and {expenses} expense(s) imported.', { bills: result.bills, expenses: result.expenses }) + refused);
    } catch (e) {
      notify(t('Import failed'), t(e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <ButtonRow>
      <Button small variant="secondary" title={t('Import CSV')} icon="cloud-upload-outline" onPress={importFile} />
      <Button small variant="secondary" title={t('CSV Template')} icon="download-outline" onPress={downloadTemplate} />
    </ButtonRow>
  );
}
