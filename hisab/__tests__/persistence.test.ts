import { diffStates, migrate } from '../src/data/persistence';
import { newInvoiceLine, newMove, postMove, saveDraft } from '../src/domain/engine';
import { createDemoCompany } from '../src/domain/seed';

describe('persistence diff', () => {
  it('writes everything for a new company', () => {
    const s = createDemoCompany();
    const c = diffStates(null, s);
    expect(c.upserts.length).toBe(
      s.accounts.length + s.journals.length + s.taxes.length + s.paymentTerms.length + s.partners.length + s.products.length +
        s.analyticAccounts.length + s.moves.length + s.reconciles.length + s.payments.length + s.statementLines.length + s.assets.length +
        s.budgets.length + s.employees.length + s.payrollRuns.length + s.cashClosings.length,
    );
    expect(c.meta.map((m) => m.key).sort()).toEqual(['sequences', 'settings']);
  });

  it('only writes changed records', () => {
    const s = createDemoCompany();
    let mv = newMove(s, 'out_invoice', { partnerId: s.partners[0].id });
    mv = { ...mv, invoiceLines: [newInvoiceLine({ label: 'x', priceUnit: 10 })] };
    const next = postMove(saveDraft(s, mv), mv.id);
    const c = diffStates(s, next);
    expect(c.upserts).toHaveLength(1);
    expect(c.upserts[0]).toMatchObject({ collection: 'moves', id: mv.id });
    expect(c.deletes).toHaveLength(0);
    expect(c.meta.map((m) => m.key)).toEqual(['sequences']);
    const removed = { ...next, partners: next.partners.slice(1) };
    expect(diffStates(next, removed).deletes).toEqual([{ collection: 'partners', id: next.partners[0].id }]);
  });

  it('migrates older backups missing collections', () => {
    const s = createDemoCompany();
    const old = { ...s } as Partial<typeof s>;
    delete old.assets;
    delete old.sequences;
    const m = migrate(old as typeof s);
    expect(m.assets).toEqual([]);
    expect(m.sequences).toEqual({});
  });
});
