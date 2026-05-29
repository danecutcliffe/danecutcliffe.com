import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { PasskeySupport, TimeClockService } from '../services/TimeClockService';
import {
  formatPasskeyError,
  isPasskeyAutoSignInEnabled,
  isPasskeyBackendDisabled,
  isPasskeysDisabledError,
  markPasskeyBackendDisabled,
} from '../utils/passkeys';

interface AuthScreenProps {
  service: TimeClockService;
  onSignedIn: () => Promise<void>;
}

export function AuthScreen({ service, onSignedIn }: AuthScreenProps) {
  const [mode, setMode] = useState<'sign-in' | 'create-account'>('sign-in');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [failedSignInCount, setFailedSignInCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [passkeyNotice, setPasskeyNotice] = useState<string | null>(null);
  const [passkeySupport, setPasskeySupport] = useState<PasskeySupport | null>(null);
  const hasTriedPasskeySignIn = useRef(false);

  useEffect(() => {
    let isMounted = true;
    if (!service.getPasskeySupport) return undefined;

    service.getPasskeySupport()
      .then((support) => {
        if (isMounted) setPasskeySupport(support);
      })
      .catch(() => {
        if (isMounted) setPasskeySupport(null);
      });

    return () => {
      isMounted = false;
    };
  }, [service]);

  const shouldAutoUsePasskey = mode === 'sign-in'
    && Boolean(passkeySupport?.isSupported && service.signInWithPasskey)
    && isPasskeyAutoSignInEnabled()
    && !isPasskeyBackendDisabled();

  useEffect(() => {
    if (!shouldAutoUsePasskey || hasTriedPasskeySignIn.current || isBusy) return;

    hasTriedPasskeySignIn.current = true;
    const run = async () => {
      setIsBusy(true);
      setError(null);
      setMessage(null);
      setPasskeyNotice('Checking your saved Face ID or Touch ID sign-in...');
      try {
        await service.signInWithPasskey?.();
        setFailedSignInCount(0);
        await onSignedIn();
      } catch (err) {
        if (isPasskeysDisabledError(err)) {
          markPasskeyBackendDisabled();
          setPasskeySupport((support) => ({
            isSupported: false,
            label: support?.label ?? 'Use Passkey',
            unavailableReason: formatPasskeyError(err),
          }));
          setPasskeyNotice(null);
          return;
        }
        setPasskeyNotice(`${formatPasskeyError(err)} Sign in with your password.`);
      } finally {
        setIsBusy(false);
      }
    };

    void run();
  }, [isBusy, onSignedIn, service, shouldAutoUsePasskey]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === 'sign-in' && !service.signIn) return;
    if (mode === 'create-account' && !service.signUp) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    setPasskeyNotice(null);
    try {
      if (mode === 'sign-in') {
        await service.signIn?.({ email, password });
        setFailedSignInCount(0);
        await onSignedIn();
      } else {
        if (!firstName.trim() || !lastName.trim()) throw new Error('Enter your first and last name.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await service.signUp?.({ email, password, firstName, lastName });
        setPassword('');
        setConfirmPassword('');
        setMessage('Check your email to confirm the account. After confirmation, an admin still needs to add your employee profile before you can punch time.');
      }
    } catch (err) {
      if (mode === 'sign-in') setFailedSignInCount((count) => count + 1);
      setError(err instanceof Error ? err.message : mode === 'sign-in' ? 'Unable to sign in.' : 'Unable to create account.');
    } finally {
      setIsBusy(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!service.resetPassword) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    setPasskeyNotice(null);
    try {
      if (!email.trim()) throw new Error('Enter your email address first.');
      await service.resetPassword({ email });
      setMessage('Password reset email sent. Check your email for the reset link.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send password reset email.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-md rounded-md border border-app-border bg-card p-5 shadow-soft">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{mode === 'sign-in' ? 'Time clock sign in' : 'Create account'}</p>
      <h2 className="mt-1 text-2xl font-bold">{mode === 'sign-in' ? 'Time Clock' : 'Create your account'}</h2>
      {mode === 'create-account' && (
        <p className="mt-2 text-sm font-semibold text-muted">
          Create your login first. An admin still needs to add your employee profile before you can punch time.
        </p>
      )}
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-semibold text-muted" htmlFor="email">
          Email
          <input
            id="email"
            className="mt-2 min-h-12 w-full rounded-md border border-input-border bg-card px-3 text-base"
            type="email"
            autoComplete={mode === 'sign-in' ? 'username' : 'email'}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {mode === 'create-account' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-muted" htmlFor="first-name">
              First name
              <input
                id="first-name"
                className="mt-2 min-h-12 w-full rounded-md border border-input-border bg-card px-3 text-base"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-semibold text-muted" htmlFor="last-name">
              Last name
              <input
                id="last-name"
                className="mt-2 min-h-12 w-full rounded-md border border-input-border bg-card px-3 text-base"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </label>
          </div>
        )}
        <label className="block text-sm font-semibold text-muted" htmlFor="password">
          Password
          <PasswordField
            id="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            value={password}
            isVisible={isPasswordVisible}
            onChange={setPassword}
            onToggleVisible={() => setIsPasswordVisible(!isPasswordVisible)}
          />
        </label>
        {mode === 'create-account' && (
          <label className="block text-sm font-semibold text-muted" htmlFor="confirm-password">
            Confirm password
            <PasswordField
              id="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              isVisible={isConfirmPasswordVisible}
              onChange={setConfirmPassword}
              onToggleVisible={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)}
            />
          </label>
        )}
        {message && <div className="rounded-md border border-success-border bg-success-bg p-3 text-sm font-semibold text-success">{message}</div>}
        {passkeyNotice && <div className="rounded-md bg-card-alt p-3 text-sm font-semibold text-muted">{passkeyNotice}</div>}
        {error && <div className="rounded-md border border-error-border bg-error-bg p-3 text-sm font-semibold text-error-text">{error}</div>}
        <button className="min-h-14 w-full rounded-md bg-accent px-4 text-lg font-bold text-white disabled:opacity-60" type="submit" disabled={isBusy}>
          {isBusy ? (mode === 'sign-in' ? 'Signing in...' : 'Creating account...') : mode === 'sign-in' ? 'Sign In' : 'Create Account'}
        </button>
        {mode === 'sign-in' && service.resetPassword && failedSignInCount >= 3 && (
          <button className="min-h-12 w-full rounded-md border border-input-border bg-card px-4 font-bold text-muted-strong disabled:opacity-60" type="button" disabled={isBusy} onClick={sendPasswordReset}>
            Forgot Password? Send Reset Email
          </button>
        )}
      </form>
      {service.signUp && (
        <div className="mt-5 border-t border-app-border-subtle pt-4 text-center text-sm font-semibold text-muted">
          {mode === 'sign-in' ? 'New to the time clock?' : 'Already have an account?'}{' '}
          <button
            className="font-bold text-accent underline-offset-4 hover:underline"
            type="button"
            onClick={() => {
              setMode(mode === 'sign-in' ? 'create-account' : 'sign-in');
              setError(null);
              setMessage(null);
              setPassword('');
              setConfirmPassword('');
              setFirstName('');
              setLastName('');
            }}
          >
            {mode === 'sign-in' ? 'Create account' : 'Sign in'}
          </button>
        </div>
      )}
    </section>
  );
}

function PasswordField({
  id,
  autoComplete,
  value,
  isVisible,
  onChange,
  onToggleVisible,
}: {
  id: string;
  autoComplete: string;
  value: string;
  isVisible: boolean;
  onChange: (value: string) => void;
  onToggleVisible: () => void;
}) {
  return (
    <div className="mt-2 flex min-h-12 overflow-hidden rounded-md border border-input-border bg-card">
      <input
        id={id}
        className="min-h-12 min-w-0 flex-1 border-0 bg-card px-3 text-base outline-none"
        type={isVisible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
      <button
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        className="inline-flex min-h-12 w-12 shrink-0 items-center justify-center text-muted transition hover:bg-card-alt"
        type="button"
        onClick={onToggleVisible}
      >
        {isVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
