import { useEffect, useState } from 'react';
import type { AppRole, Profile } from '../domain/types';
import type { TimeClockService } from '../services/TimeClockService';

interface SettingsScreenProps {
  profile: Profile;
  service: TimeClockService;
  onRoleChange?: (role: AppRole) => void;
  onSignOut?: () => Promise<void>;
}

export function SettingsScreen({ profile, service, onRoleChange, onSignOut }: SettingsScreenProps) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <section className="space-y-4">
      <div id="profile" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Profile</p>
        <h2 className="mt-1 text-2xl font-bold">{profile.firstName} {profile.lastName}</h2>
        <p className="mt-1 text-muted">{profile.email}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-card-alt p-3"><p className="font-semibold text-muted">Role</p><p className="mt-1 text-lg font-bold capitalize">{profile.role}</p></div>
          <div className="rounded-md bg-card-alt p-3"><p className="font-semibold text-muted">Hourly rate</p><p className="mt-1 text-lg font-bold">${profile.hourlyRate.toFixed(2)}</p></div>
        </div>
      </div>

      {onRoleChange && <div className="rounded-md border border-app-border bg-card p-4 shadow-soft">
        <h3 className="text-lg font-bold">Development role</h3>
        <p className="mt-1 text-sm text-muted">Mock-only switcher for workflow testing.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['employee', 'admin'] as AppRole[]).map((role) => (
            <button key={role} className={`min-h-12 rounded-md border px-3 font-bold capitalize ${profile.role === role ? 'border-accent bg-accent text-white' : 'border-input-border bg-card text-muted-strong'}`} type="button" onClick={() => onRoleChange(role)}>
              {role}
            </button>
          ))}
        </div>
      </div>}

      {service.updatePassword && (
        <div id="password" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Password</h3>
            <button
              className="min-h-10 rounded-md border border-input-border px-3 text-sm font-bold text-muted-strong"
              type="button"
              onClick={() => setIsPasswordOpen(!isPasswordOpen)}
            >
              {isPasswordOpen ? 'Cancel' : 'Change Password'}
            </button>
          </div>
          {isPasswordOpen && (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-semibold text-muted">
                  Current password
                  <input className="mt-1.5 min-h-12 w-full rounded-md border border-input-border px-3" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                </label>
                <label className="block text-sm font-semibold text-muted">
                  New password
                  <input className="mt-1.5 min-h-12 w-full rounded-md border border-input-border px-3" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </label>
                <label className="block text-sm font-semibold text-muted">
                  Confirm new password
                  <input className="mt-1.5 min-h-12 w-full rounded-md border border-input-border px-3" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </label>
              </div>
              {passwordMessage && <p className="mt-3 rounded-md bg-success-bg p-3 text-sm font-semibold text-success">{passwordMessage}</p>}
              {passwordError && <p className="mt-3 rounded-md bg-error-bg p-3 text-sm font-semibold text-error-text">{passwordError}</p>}
              <button
                className="mt-3 min-h-12 rounded-md bg-accent px-4 font-bold text-white disabled:opacity-60"
                type="button"
                disabled={isUpdatingPassword || !currentPassword || !newPassword || !confirmPassword}
                onClick={async () => {
                  setIsUpdatingPassword(true);
                  setPasswordMessage(null);
                  setPasswordError(null);
                  try {
                    if (newPassword !== confirmPassword) throw new Error('Passwords do not match.');
                    await service.updatePassword?.({ currentPassword, password: newPassword });
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setIsPasswordOpen(false);
                    setPasswordMessage('Password updated.');
                  } catch (err) {
                    setPasswordError(err instanceof Error ? err.message : 'Unable to update password.');
                  } finally {
                    setIsUpdatingPassword(false);
                  }
                }}
              >
                {isUpdatingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </>
          )}
          {!isPasswordOpen && passwordMessage && <p className="mt-3 rounded-md bg-success-bg p-3 text-sm font-semibold text-success">{passwordMessage}</p>}
        </div>
      )}

      <div id="connection" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
        <h3 className="text-lg font-bold">Connection</h3>
        <p className={`mt-2 font-semibold ${isOnline ? 'text-success' : 'text-warning'}`}>{isOnline ? 'Browser reports online' : 'Browser reports offline'}</p>
        <p className="mt-2 text-sm text-muted">Offline clock queueing is intentionally deferred.</p>
      </div>

      {onSignOut && (
        <button
          className="min-h-12 w-full rounded-md border border-input-border bg-card px-4 font-bold text-muted-strong disabled:opacity-60"
          type="button"
          disabled={isSigningOut}
          onClick={async () => {
            setIsSigningOut(true);
            try {
              await onSignOut();
            } finally {
              setIsSigningOut(false);
            }
          }}
        >
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </button>
      )}
    </section>
  );
}
