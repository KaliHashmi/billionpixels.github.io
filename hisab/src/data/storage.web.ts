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
  } catch (e) {
    // A full browser store must be reported: the change would otherwise be lost on reload.
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('This browser has no room left to save the books. Remove some receipt photos or use the iPhone or Android app.\nلا توجد مساحة كافية في المتصفح لحفظ الدفاتر. احذف بعض صور الإيصالات أو استخدم تطبيق آيفون أو أندرويد.');
    }
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
    // Also forget sign-in details kept in this browser (last username, remembered session).
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('hisab:pref:') && k !== 'hisab:pref:lang') localStorage.removeItem(k);
    } catch {
      // Storage unavailable.
    }
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
