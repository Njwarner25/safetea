// React Native CLI / Expo autolinking config.
//
// We disable `react-native-iap` autolinking on Android because:
// - IAP is iOS-only in this app (StoreKit). Android uses Stripe via the
//   web checkout flow — see services/iap.ts header comment.
// - react-native-iap@15.x declares `react-native-nitro-modules` as a peer
//   dep, which is not installed. Letting autolinking pull react-native-iap
//   into the Android Gradle build causes :react-native-iap:compileReleaseKotlin
//   to fail.
// - services/iap.ts already gates the JS import on Platform.OS === 'ios'
//   so the bundle dead-code-eliminates it on Android.
//
// iOS autolinking is untouched — the module still compiles into the iOS app.

module.exports = {
  dependencies: {
    'react-native-iap': {
      platforms: {
        android: null,
      },
    },
  },
};
