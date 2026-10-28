import { ENV } from '../config/env';
import { AppState } from '../domain/types';
import { migrate, Storage } from './persistence';

// The web build is only used for previews and testing; it keeps the whole book in localStorage.
const KEY = `hisab:${ENV.databaseName}`;
let latest: AppState | null = null;

function persist() {
  try {
    if (latest) localStorage.setItem(KEY, JSON.stringify(latest));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode): keep data in memory only.
  }
}

export const storage: Storage = {
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      latest = raw ? migrate(JSON.parse(raw)) : null;
    } catch {
      latest = null;
    }
    return latest;
  },
  async apply(_change, next) {
    latest = next;
    persist();
  },
  async replaceAll(state) {
    latest = state;
    persist();
  },
  async clear() {
    latest = null;
    persist();
  },
  async getPref(key) {
    try {
      return localStorage.getItem(`hisab:pref:${key}`);
    } catch {
      return null;
    }
  },
  async setPref(key, value) {
    try {
      localStorage.setItem(`hisab:pref:${key}`, value);
    } catch {
      // Preferences are optional.
    }
  },
};
