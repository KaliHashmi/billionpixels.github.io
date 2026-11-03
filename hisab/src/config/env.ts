import Constants from 'expo-constants';

export type AppVariant = 'development' | 'uat' | 'production';

/** Public website with the privacy policy, data deletion and support pages (change it when the app gets its own domain). */
const SITE = ((Constants.expoConfig?.extra as { siteUrl?: string } | undefined)?.siteUrl ?? 'https://kalihashmi.github.io/billionpixels.github.io/hisab').replace(/\/$/, '');

const variant = ((Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant ?? 'development') as AppVariant;

export const ENV = {
  variant,
  isProduction: variant === 'production',
  isUAT: variant === 'uat',
  /** Each variant keeps its own database so UAT testing never touches real books. */
  databaseName: variant === 'production' ? 'hisab.db' : `hisab-${variant}.db`,
  /** UAT and development builds offer to load demo data during onboarding. */
  allowDemoData: variant !== 'production',
  label: variant === 'production' ? '' : variant === 'uat' ? 'UAT' : 'DEV',
  bannerColor: variant === 'uat' ? '#A84E00' : '#2C3E50',
  /** Store-required public pages (App Store Connect and Play Console ask for these URLs). */
  links: {
    privacy: `${SITE}/privacy/`,
    terms: `${SITE}/terms/`,
    licenses: `${SITE}/licenses/`,
    deleteData: `${SITE}/delete-data/`,
    support: `${SITE}/support/`,
  },
  version: Constants.expoConfig?.version ?? '1.0.0',
};
