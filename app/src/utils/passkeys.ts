import type { PasskeySupport } from '../services/TimeClockService';

const PASSKEY_AUTO_SIGN_IN_KEY = 'time-clock-passkey-auto-sign-in-enabled';
const PASSKEY_BACKEND_DISABLED_KEY = 'time-clock-passkey-backend-disabled';

function readStorage(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures. Password sign-in remains available.
  }
}

function removeStorage(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures. Password sign-in remains available.
  }
}

export function getPasskeyLabel() {
  if (typeof navigator === 'undefined') return 'Use Passkey';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'Use Face ID or Touch ID';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Use Touch ID or Passkey';
  return 'Use Passkey';
}

export async function getBrowserPasskeySupport(): Promise<PasskeySupport> {
  const label = getPasskeyLabel();

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isSupported: false, label, unavailableReason: 'Passkeys are only available in a browser.' };
  }

  if (!window.isSecureContext) {
    return { isSupported: false, label, unavailableReason: 'Passkeys require a secure HTTPS connection.' };
  }

  if (!('PublicKeyCredential' in window) || !navigator.credentials) {
    return { isSupported: false, label, unavailableReason: 'This browser does not support passkeys.' };
  }

  const credential = window.PublicKeyCredential;
  if (typeof credential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try {
      const hasDeviceAuthenticator = await credential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!hasDeviceAuthenticator) {
        return { isSupported: false, label, unavailableReason: 'No device biometric or passkey authenticator is available.' };
      }
    } catch {
      return { isSupported: false, label, unavailableReason: 'The browser could not check biometric availability.' };
    }
  }

  return { isSupported: true, label };
}

export function formatPasskeyDate(value?: string) {
  if (!value) return 'Never used';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function isPasskeysDisabledError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.toLowerCase().includes('passkeys are disabled');
}

export function formatPasskeyError(err: unknown) {
  if (isPasskeysDisabledError(err)) {
    return 'Biometric sign-in is not enabled in Supabase yet. Password sign-in still works.';
  }
  return err instanceof Error ? err.message : 'Unable to use biometric sign-in.';
}

export function getPasskeyFriendlyName() {
  if (typeof navigator === 'undefined') return 'Time Clock passkey';
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone Face ID';
  if (/iPad/i.test(ua)) return 'iPad Face ID';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac Touch ID';
  return 'Time Clock passkey';
}

export function getPasskeySetupDismissedKey(profileId: string) {
  return `time-clock-passkey-setup-dismissed:${profileId}`;
}

export function hasDismissedPasskeySetup(profileId: string) {
  return readStorage(getPasskeySetupDismissedKey(profileId)) === 'true';
}

export function dismissPasskeySetup(profileId: string) {
  writeStorage(getPasskeySetupDismissedKey(profileId), 'true');
}

export function isPasskeyAutoSignInEnabled() {
  return readStorage(PASSKEY_AUTO_SIGN_IN_KEY) === 'true';
}

export function markPasskeyAutoSignInEnabled() {
  writeStorage(PASSKEY_AUTO_SIGN_IN_KEY, 'true');
  removeStorage(PASSKEY_BACKEND_DISABLED_KEY);
}

export function isPasskeyBackendDisabled() {
  return readStorage(PASSKEY_BACKEND_DISABLED_KEY) === 'true';
}

export function markPasskeyBackendDisabled() {
  writeStorage(PASSKEY_BACKEND_DISABLED_KEY, 'true');
}
