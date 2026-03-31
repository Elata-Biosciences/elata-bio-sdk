export type BluetoothSupportResult =
  | { supported: true }
  | { supported: false; isIOS: boolean; message: string };

/**
 * Checks whether Web Bluetooth is available in the current browser.
 *
 * On iOS, the standard Chrome and Safari apps do not expose the Web Bluetooth
 * API — only Bluefy (a dedicated browser) does. This function returns an
 * actionable message so the caller can guide the user to install the right
 * browser.
 */
export function checkWebBluetooth(): BluetoothSupportResult {
  if (typeof navigator === "undefined") {
    return { supported: false, isIOS: false, message: "Web Bluetooth requires a browser environment." };
  }

  if (!!navigator.bluetooth) {
    return { supported: true };
  }

  // Detect iOS: covers iPhone/iPad/iPod plus iPadOS 13+ desktop mode
  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    return {
      supported: false,
      isIOS: true,
      message:
        "Web Bluetooth is not supported by Safari or Chrome on iOS. " +
        "Please use Bluefy — a free browser app that enables Web Bluetooth on iPhone and iPad.",
    };
  }

  return {
    supported: false,
    isIOS: false,
    message:
      "Web Bluetooth is not supported in this browser. " +
      "Please use Chrome to connect your headband.",
  };
}
