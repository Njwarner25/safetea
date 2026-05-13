// Platform-aware Expo config.
// iOS builds = LinkHer (App Store rebrand, sister app to SafeTea)
// Android builds = SafeTea
// Same bundle id (app.getsafetea.mobile), same backend (api.getsafetea.app).
//
// Apple rejected the initial SafeTea iOS submission citing Guideline 4.3 (similar
// concept to other safety apps). This config rebrands the iOS binary to LinkHer
// while keeping the Android app untouched.

import type { ExpoConfig } from 'expo/config';
import * as fs from 'fs';
import * as path from 'path';

const IS_IOS_BUILD = process.env.EAS_BUILD_PLATFORM === 'ios';

// Resolve a LinkHer asset path if the file exists; otherwise fall back to the
// shared SafeTea asset so iOS builds don't break before the LinkHer art is dropped in.
function resolveAsset(linkHerPath: string, fallback: string): string {
  try {
    const abs = path.resolve(__dirname, linkHerPath);
    return fs.existsSync(abs) ? linkHerPath : fallback;
  } catch {
    return fallback;
  }
}

// LinkHer (iOS) brand. iconPath / splashPath fall back to the shared assets if
// the LinkHer-specific PNGs haven't been added yet.
const LINKHER = {
  name: 'LinkHer',
  splashBg: '#0D0B1A',
  notificationColor: '#E84393',
  iconPath: resolveAsset('./assets/icon-linkher.png', './assets/icon.png'),
  splashPath: resolveAsset('./assets/splash-linkher.png', './assets/splash.png'),
  iosTagline: 'Stay Connected. Stay Safe.',
};

// SafeTea (Android + web) brand
const SAFETEA = {
  name: 'SafeTea',
  splashBg: '#1A1A2E',
  notificationColor: '#E8A0B5',
  iconPath: './assets/icon.png',
  splashPath: './assets/splash.png',
  androidTagline: 'Personal Safety',
};

// iOS permission strings — rebranded to LinkHer
const IOS_PERMISSIONS = {
  NSLocationWhenInUseUsageDescription:
    'LinkHer uses your location to share your GPS coordinates with trusted contacts during an SOS alert.',
  NSMicrophoneUsageDescription:
    'LinkHer uses the microphone for audio safety features.',
  NSCameraUsageDescription:
    'LinkHer uses the camera for identity verification selfies.',
  ITSAppUsesNonExemptEncryption: false,
};

// Android permission strings — keep SafeTea
const ANDROID_LOCATION_PERMISSION =
  'SafeTea uses your location to share your GPS coordinates with trusted contacts during an SOS alert.';
const ANDROID_CAMERA_PERMISSION =
  'SafeTea uses the camera for identity verification selfies.';
const ANDROID_MIC_PERMISSION =
  'SafeTea uses the microphone for audio features.';

// Top-level name shown in Expo dev client + the build artifact name.
// Use the iOS brand when EAS is building for iOS so TestFlight + the App Store
// artifact land as "LinkHer".
const TOP_LEVEL_NAME = IS_IOS_BUILD ? LINKHER.name : SAFETEA.name;
const TOP_LEVEL_ICON = IS_IOS_BUILD ? LINKHER.iconPath : SAFETEA.iconPath;
const TOP_LEVEL_SPLASH_BG = IS_IOS_BUILD ? LINKHER.splashBg : SAFETEA.splashBg;
const TOP_LEVEL_SPLASH_IMG = IS_IOS_BUILD ? LINKHER.splashPath : SAFETEA.splashPath;

const config: ExpoConfig = {
  name: TOP_LEVEL_NAME,
  slug: 'safetea',
  version: '1.0.2',
  orientation: 'portrait',
  icon: TOP_LEVEL_ICON,
  userInterfaceStyle: 'dark',
  scheme: 'safetea',
  splash: {
    image: TOP_LEVEL_SPLASH_IMG,
    resizeMode: 'contain',
    backgroundColor: TOP_LEVEL_SPLASH_BG,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.getsafetea.mobile',
    buildNumber: '4',
    infoPlist: IOS_PERMISSIONS,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1A1A2E',
    },
    package: 'app.getsafetea.mobile',
    versionCode: 1037,
    // Android share-sheet intent filters are declared TWICE on purpose:
    //
    // 1. android.intentFilters below — manifest-merged at native build time,
    //    explicit declaration of SEND / SEND_MULTIPLE acceptance per
    //    mime type. This is what makes us show up in the OS share sheet.
    // 2. expo-share-intent plugin (see plugins[]) — ships a native bridge
    //    that reads ACTION_SEND's EXTRA_STREAM and exposes the content URI
    //    to JS via useShareIntent(). Without it, expo-linking's URL event
    //    listener never sees SEND intents (those don't carry a URL).
    //
    // The plugin's androidIntentFilters mirrors the mime list below so
    // both declarations stay in lock-step; the merged AndroidManifest
    // will have the union, which is fine (duplicates are coalesced).
    intentFilters: [
      {
        action: 'SEND',
        category: ['DEFAULT'],
        data: [
          { mimeType: 'image/*' },
          { mimeType: 'video/*' },
          { mimeType: 'audio/*' },
          { mimeType: 'application/pdf' },
          { mimeType: 'text/plain' },
        ],
      },
      {
        action: 'SEND_MULTIPLE',
        category: ['DEFAULT'],
        data: [
          { mimeType: 'image/*' },
          { mimeType: 'video/*' },
        ],
      },
    ],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-camera',
      {
        cameraPermission: IS_IOS_BUILD
          ? IOS_PERMISSIONS.NSCameraUsageDescription
          : ANDROID_CAMERA_PERMISSION,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: IS_IOS_BUILD
          ? IOS_PERMISSIONS.NSLocationWhenInUseUsageDescription
          : ANDROID_LOCATION_PERMISSION,
      },
    ],
    [
      'expo-av',
      {
        microphonePermission: IS_IOS_BUILD
          ? IOS_PERMISSIONS.NSMicrophoneUsageDescription
          : ANDROID_MIC_PERMISSION,
      },
    ],
    [
      'expo-notifications',
      {
        icon: TOP_LEVEL_ICON,
        color: IS_IOS_BUILD ? LINKHER.notificationColor : SAFETEA.notificationColor,
      },
    ],
    // expo-share-intent: ships the native bridge that reads
    // ACTION_SEND's EXTRA_STREAM on Android and the iOS NSItemProvider
    // payload (when the iOS Share Extension target ships — that's still
    // Mac's column; see SYNC.md). Android-only here: iOS is disabled to
    // avoid clashing with the Capacitor iOS shell on Mac's side.
    [
      'expo-share-intent',
      {
        disableIOS: true,
        // Mime patterns must match android.intentFilters above so the
        // OS only routes mime types we actually accept.
        androidIntentFilters: ['image/*', 'video/*', '*/*'],
        androidMultiIntentFilters: ['image/*', 'video/*'],
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // minSdkVersion stays at Expo SDK 52's default (24). React Native
          // 0.76.9 hard-requires minSdk 24; setting lower fails manifest merge.
          // The ~1,435 Android 6.0 devices Play warns about are a structural
          // loss of the SDK 52 upgrade — click "Proceed anyway" in Play Console.
          targetSdkVersion: 35,
          compileSdkVersion: 35,
          // Disable legacy packaging so native libraries are page-aligned
          // and uncompressed in the APK/AAB. Addresses Play Console's
          // "Your app does not support 16 KB memory page sizes" warning
          // (Android 15 requirement for new Pixel devices).
          useLegacyPackaging: false,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: '13404653-99fa-49c1-af47-c981dbd27027',
    },
  },
};

export default config;
