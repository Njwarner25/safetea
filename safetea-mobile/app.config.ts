// Platform-aware Expo config.
// iOS builds = LinkHer (App Store rebrand, sister app to SafeTea)
// Android builds = SafeTea
// Separate iOS bundle id (app.linkher.mobile) per Apple Guideline 4.3 fix;
// shared backend (api.getsafetea.app).
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
  scheme: IS_IOS_BUILD ? 'linkher' : 'safetea',
  splash: {
    image: TOP_LEVEL_SPLASH_IMG,
    resizeMode: 'contain',
    backgroundColor: TOP_LEVEL_SPLASH_BG,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.linkher.mobile',
    buildNumber: '4',
    infoPlist: IOS_PERMISSIONS,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1A1A2E',
    },
    package: 'app.getsafetea.mobile',
    versionCode: 23,
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
    [
      'expo-build-properties',
      {
        android: {
          targetSdkVersion: 35,
          compileSdkVersion: 35,
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
