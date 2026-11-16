/**
 * The search box on list screens: true when nothing is typed, or when any of the given values
 * contains what was typed (ignoring case and surrounding spaces). Missing values are skipped.
 */
export function matchesSearch(query: string, ...values: (string | number | false | null | undefined)[]): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return values.some((v) => v !== false && v !== null && v !== undefined && String(v).toLowerCase().includes(term));
}
