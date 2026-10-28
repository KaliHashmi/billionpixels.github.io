import * as SQLite from 'expo-sqlite';
import { ENV } from '../config/env';
import { AppState } from '../domain/types';
import { Change, COLLECTIONS, diffStates, migrate, SCHEMA_VERSION, Storage } from './persistence';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const conn = await SQLite.openDatabaseAsync(ENV.databaseName);
      await conn.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS records (
          collection TEXT NOT NULL,
          id TEXT NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (collection, id)
        );
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      `);
      await conn.runAsync('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', 'schemaVersion', String(SCHEMA_VERSION));
      return conn;
    })();
  }
  return dbPromise;
}

async function write(change: Change, wipe = false): Promise<void> {
  const conn = await db();
  await conn.withExclusiveTransactionAsync(async (txn) => {
    if (wipe) {
      await txn.runAsync('DELETE FROM records');
      await txn.runAsync("DELETE FROM meta WHERE key IN ('settings', 'sequences')");
    }
    for (const u of change.upserts) {
      await txn.runAsync('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)', u.collection, u.id, JSON.stringify(u.data));
    }
    for (const d of change.deletes) {
      await txn.runAsync('DELETE FROM records WHERE collection = ? AND id = ?', d.collection, d.id);
    }
    for (const m of change.meta) {
      await txn.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', m.key, JSON.stringify(m.value));
    }
  });
}

export const storage: Storage = {
  async load() {
    const conn = await db();
    const settings = await conn.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'settings'");
    if (!settings) return null;
    const sequences = await conn.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'sequences'");
    const state: Record<string, unknown> = {
      settings: JSON.parse(settings.value),
      sequences: sequences ? JSON.parse(sequences.value) : {},
    };
    for (const c of COLLECTIONS) state[c] = [];
    const rows = await conn.getAllAsync<{ collection: string; data: string }>('SELECT collection, data FROM records');
    for (const r of rows) (state[r.collection] as unknown[] | undefined)?.push(JSON.parse(r.data));
    return migrate(state as unknown as AppState);
  },
  apply: (change) => write(change),
  replaceAll: (state: AppState) => write(diffStates(null, state), true),
  async clear() {
    await write({ upserts: [], deletes: [], meta: [] }, true);
  },
};
