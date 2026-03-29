import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Prevents screenshots and screen recording while the app is active.
 * On iOS: blocks screen capture and shows a blank screen during recording.
 * On Android: sets FLAG_SECURE to prevent screenshots and screen recording.
 */
export function useScreenshotPrevention() {
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync();

    return () => {
      ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);
}
