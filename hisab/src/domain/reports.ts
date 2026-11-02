/**
 * Financial reports: pure functions over AppState. Split by topic in ./reports/;
 * import from here so callers do not depend on the file layout.
 */
export * from './reports/base';
export * from './reports/statements';
export * from './reports/ledgers';
export * from './reports/vat';
export * from './reports/dashboard';
