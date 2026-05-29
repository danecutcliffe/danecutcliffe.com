import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import type { Profile } from '../domain/types';
import type { PasskeySupport, TimeClockService } from '../services/TimeClockService';
import {
  dismissPasskeySetup,
  formatPasskeyError,
  getPasskeyFriendlyName,
  hasDismissedPasskeySetup,
  isPasskeysDisabledError,
  markPasskeyAutoSignInEnabled,
  markPasskeyBackendDisabled,
} from '../utils/passkeys';

interface PasskeySetupPromptProps {
  profile: Profile;
  service: TimeClockService;
}

export function PasskeySetupPrompt({ profile, service }: PasskeySetupPromptProps) {
  const [support, setSupport] = useState<PasskeySupport | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!service.getPasskeySupport || !service.registerPasskey || !service.listPasskeys) return;
      if (hasDismissedPasskeySetup(profile.id)) return;

      try {
        const nextSupport = await service.getPasskeySupport();
        if (!isMounted || !nextSupport.isSupported) return;

        const passkeys = await service.listPasskeys();
        if (!isMounted) return;

        setSupport(nextSupport);
        setIsVisible(passkeys.length === 0);
      } catch (err) {
        if (isPasskeysDisabledError(err)) markPasskeyBackendDisabled();
        if (isMounted) setIsVisible(false);
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [profile.id, service]);

  if (!isVisible || !support) return null;

  const dismiss = () => {
    dismissPasskeySetup(profile.id);
    setIsVisible(false);
  };

  const title = support.label.replace(/^Use /, 'Log in with ');

  return (
    <section className="rounded-md border border-app-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Faster sign-in</p>
          <h2 className="mt-1 text-xl font-bold">{title} next time?</h2>
          <p className="mt-1 text-sm font-semibold text-muted">This device can use a passkey for faster sign-in. Your password is not stored here.</p>
        </div>
        <button
          aria-label="Dismiss biometric sign-in prompt"
          className="inline-flex min-h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input-border text-muted transition hover:bg-card-alt"
          type="button"
          onClick={dismiss}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {error && <p className="mt-3 rounded-md bg-error-bg p-3 text-sm font-semibold text-error-text">{error}</p>}
      <button
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 font-bold text-white disabled:opacity-60"
        type="button"
        disabled={isBusy}
        onClick={async () => {
          setIsBusy(true);
          setError(null);
          try {
            await service.registerPasskey?.({ friendlyName: getPasskeyFriendlyName() });
            markPasskeyAutoSignInEnabled();
            dismiss();
          } catch (err) {
            if (isPasskeysDisabledError(err)) {
              markPasskeyBackendDisabled();
              setIsVisible(false);
              return;
            }
            setError(formatPasskeyError(err));
          } finally {
            setIsBusy(false);
          }
        }}
      >
        <KeyRound size={18} aria-hidden="true" />
        {isBusy ? 'Opening device prompt...' : 'Yes, set it up'}
      </button>
      <button
        className="mt-2 min-h-11 w-full rounded-md border border-input-border bg-card px-4 text-sm font-bold text-muted-strong"
        type="button"
        onClick={dismiss}
      >
        Not now
      </button>
    </section>
  );
}
