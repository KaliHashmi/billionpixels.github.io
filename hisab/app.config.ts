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
/** Only for hosted browser previews: a placeholder base path rewritten when the page loads. */
const WEB_BASE = process.env.HISAB_WEB_BASE;

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
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // English and Arabic UI (Arabic switches the layout to right-to-left).
        CFBundleLocalizations: ['en', 'ar'],
        CFBundleAllowMixedLocalizations: true,
      },
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
    plugins: [
      // Previews ship one bundle so no chunk has to be fetched from an unknown path.
      ['expo-router', WEB_BASE ? { asyncRoutes: false } : {}],
      'expo-sqlite',
      'expo-sharing',
      'expo-document-picker',
      ['expo-local-authentication', { faceIDPermission: 'Allow Hisab to use Face ID to unlock your books.' }],
    ],
    experiments: { typedRoutes: false, ...(WEB_BASE ? { baseUrl: WEB_BASE } : {}) },
    extra: {
      appVariant: VARIANT,
      supportsRTL: true,
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  };
};
