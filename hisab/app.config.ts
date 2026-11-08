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
/** Hosts the privacy policy, data deletion and support pages linked from the app and the store listings. */
const SITE_URL = process.env.HISAB_SITE_URL ?? 'https://kalihashmi.github.io/billionpixels.github.io/hisab';

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
      // App Store privacy manifest: no tracking, no data collected. The required-reason APIs below are the ones
      // React Native and Expo modules use; their own manifests are merged in at build time.
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
        NSPrivacyCollectedDataTypes: [],
        NSPrivacyAccessedAPITypes: [
          { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
          { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
          { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
          { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
        ],
      },
    },
    android: {
      package: `${BUNDLE_ID}${v.suffix}`,
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: '#1E66D0',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      // Files are picked and shared through the system pickers, so no storage, overlay or microphone permission is needed.
      // Asking only for what the app uses keeps the Play Console permission declarations short.
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.RECORD_AUDIO',
      ],
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
      siteUrl: SITE_URL,
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  };
};
