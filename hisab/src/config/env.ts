import Constants from 'expo-constants';

export type AppVariant = 'development' | 'uat' | 'production';

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
  bannerColor: variant === 'uat' ? '#E67E22' : '#2C3E50',
  version: Constants.expoConfig?.version ?? '1.0.0',
};
