// Platform detection helpers used to gate features that violate App Store
// guidelines. iOS hides Name Watch and Background Check (Guideline 5.1.1(viii)
// — collecting public-source data to build individual profiles).
import { Platform } from 'react-native';

export const isIOS = (): boolean => Platform.OS === 'ios';
export const isAndroid = (): boolean => Platform.OS === 'android';
export const isWeb = (): boolean => Platform.OS === 'web';

// Features Apple flagged as profile-building. Hidden from iOS UI and gated
// at the screen level so deep links also fail closed.
export const isProfileBuildingAllowed = (): boolean => !isIOS();
