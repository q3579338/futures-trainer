import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

let lastVibrate = 0;

export async function vibrateLiqWarn(): Promise<void> {
  const now = Date.now();
  if (now - lastVibrate < 2000) return;
  lastVibrate = now;
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      return;
    }
  } catch {
    /* fall through */
  }
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([80, 40, 80]);
  }
}

export async function vibrateFill(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Medium });
    }
  } catch {
    /* ignore */
  }
}
