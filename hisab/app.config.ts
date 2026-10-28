import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Hisab ships as three side-by-side installable variants:
 *   - development: local dev client
 *   - uat:         User Acceptance Testing build (demo data, orange banner, separate database)
 *   - production:  the store build
 *
 * Select one with APP_VARIANT (set by the EAS build profiles in eas.json).
 */
type Variant = 'development' | 'uat' | 'production';

const VARIANT = (process.env.APP_VARIANT ?? 'development') as Variant;
const BUNDLE_ID = process.env.HISAB_BUNDLE_ID ?? 'com.hisab.accounting';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;

const VARIANTS: Record<Variant, { name: string; suffix: string; scheme: string }> = {
  development: { name: 'Hisab (Dev)', suffix: '.dev', scheme: 'hisab-dev' },
  uat: { name: 'Hisab UAT', suffix: '.uat', scheme: 'hisab-uat' },
  production: { name: 'Hisab', suffix: '', scheme: 'hisab' },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = VARIANTS[VARIANT] ?? VARIANTS.development;
  return {
    ...config,
    name: v.name,
    slug: 'hisab',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: v.scheme,
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
      bundleIdentifier: `${BUNDLE_ID}${v.suffix}`,
      buildNumber: '1',
      config: { usesNonExemptEncryption: false },
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
    },
    android: {
      package: `${BUNDLE_ID}${v.suffix}`,
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: '#714B67',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
      output: 'single',
    },
    plugins: ['expo-router', 'expo-sqlite', 'expo-sharing', 'expo-document-picker'],
    experiments: { typedRoutes: false },
    extra: {
      appVariant: VARIANT,
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  };
};
