import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager, Platform } from 'react-native';
import { storage } from '../data/storage';
import { notify } from '../ui/dialog';
import { formatDateIn, Lang, translate } from './translate';

export type { Lang };

interface I18n {
  lang: Lang;
  rtl: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  fmtDate: (s?: string) => string;
  setLang: (lang: Lang) => void;
}

const Ctx = createContext<I18n | null>(null);

function applyDirection(lang: Lang): boolean {
  const rtl = lang === 'ar';
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    return false;
  }
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  // Native layout direction only flips after the app restarts.
  return true;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage
      .getPref('lang')
      .then((v) => {
        const l: Lang = v === 'ar' ? 'ar' : 'en';
        setLangState(l);
        applyDirection(l);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.setPref('lang', l).catch(() => undefined);
    if (applyDirection(l)) {
      notify(translate(l, 'Restart required'), translate(l, 'Close and reopen Hisab to switch the layout direction.'));
    }
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      rtl: lang === 'ar',
      t: (key, params) => translate(lang, key, params),
      fmtDate: (s) => formatDateIn(lang, s),
      setLang,
    }),
    [lang, setLang],
  );
  if (!ready) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useT must be used inside I18nProvider');
  return ctx;
}
