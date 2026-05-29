import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlarmClock, ChevronDown, LogOut } from 'lucide-react';
import type { AppRole, Profile } from '../domain/types';

export type AppTab = 'clock' | 'timesheets' | 'settings' | 'dashboard' | 'employees' | 'reports' | 'scope';

interface SubSection { id: string; label: string }

interface TabDef {
  id: AppTab;
  label: string;
  sections?: SubSection[];
}

interface AppShellProps {
  activeTab: AppTab;
  currentProfile: Profile | null;
  isLoading: boolean;
  onTabChange: (tab: AppTab) => void;
  onRoleChange?: (role: AppRole) => void;
  onSignOut?: () => Promise<void>;
  children: ReactNode;
}

const employeeTabs: TabDef[] = [
  { id: 'clock', label: 'Clock' },
  { id: 'timesheets', label: 'Timesheets', sections: [
    { id: 'week-nav', label: 'Week' },
    { id: 'week-summary', label: 'Summary' },
    { id: 'daily-breakdown', label: 'Daily Breakdown' },
  ]},
  { id: 'scope', label: 'Scope' },
  { id: 'settings', label: 'Settings', sections: [
    { id: 'profile', label: 'Profile' },
    { id: 'connection', label: 'Connection' },
  ]},
];

const adminTabs: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard', sections: [
    { id: 'period-readiness', label: 'Period Readiness' },
    { id: 'working-now', label: 'Working Now' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'employee-review', label: 'Employee Review' },
    { id: 'attention', label: 'Attention Queue' },
  ]},
  { id: 'timesheets', label: 'Timesheets', sections: [
    { id: 'ts-employee', label: 'Employee' },
    { id: 'ts-entries', label: 'Entries' },
    { id: 'ts-summary', label: 'Weekly Summary' },
  ]},
  { id: 'employees', label: 'Settings', sections: [
    { id: 'pay-period', label: 'Pay Period' },
    { id: 'employees', label: 'Employees' },
    { id: 'properties', label: 'Properties' },
    { id: 'job-codes', label: 'Job Codes' },
  ]},
  { id: 'reports', label: 'Reports', sections: [
    { id: 'payroll-export', label: 'Payroll Export' },
    { id: 'report-detail', label: 'Reports' },
    { id: 'csv-exports', label: 'CSV Exports' },
    { id: 'audit-trail', label: 'Audit Trail' },
  ]},
  { id: 'scope', label: 'Scope' },
];

export function AppShell({ activeTab, currentProfile, isLoading, onTabChange, onRoleChange, onSignOut, children }: AppShellProps) {
  const currentRole = currentProfile?.role ?? 'employee';
  const canUseScopes = currentRole === 'admin' || currentProfile?.canAccessScopes !== false;
  const tabs = currentProfile?.isActive ? (currentRole === 'admin' ? adminTabs : employeeTabs.filter((tab) => tab.id !== 'scope' || canUseScopes)) : [];
  const mobileTabs = tabs.filter((tab) => !(currentRole === 'admin' && tab.id === 'reports'));

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-10 border-b border-app-border bg-paper backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--color-paper)_95%,transparent)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent text-white">
              <AlarmClock size={20} aria-hidden="true" />
            </span>
            <h1 className="text-lg font-semibold leading-tight">Time Clock</h1>
          </div>
          {onRoleChange ? (
            <div className="flex rounded-full border border-input-border bg-card p-1 text-xs shadow-sm">
              {(['employee', 'admin'] as AppRole[]).map((role) => (
                <button
                  key={role}
                  className={`min-h-10 rounded-full px-3 font-semibold capitalize transition ${
                    currentRole === role ? 'bg-accent text-white' : 'text-muted'
                  }`}
                  type="button"
                  onClick={() => onRoleChange(role)}
                  disabled={isLoading}
                >
                  {role}
                </button>
              ))}
            </div>
          ) : currentProfile ? (
            <ProfileDropdown profile={currentProfile} onSignOut={onSignOut} />
          ) : null}
        </div>
      </header>

      {tabs.length > 0 ? (
        <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
          {/* Desktop sidebar */}
          <nav className="sticky top-16 hidden self-start pt-6 lg:block" aria-label="Main navigation">
            <ul className="space-y-0.5">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <li key={tab.id}>
                    <button
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-semibold transition ${
                        isActive ? 'bg-card text-accent shadow-sm' : 'text-muted hover:bg-badge-neutral hover:text-ink'
                      }`}
                      type="button"
                      onClick={() => onTabChange(tab.id)}
                    >
                      {tab.label}
                      {isActive && tab.sections && <ChevronDown size={14} className="text-muted-light" aria-hidden="true" />}
                    </button>
                    {isActive && tab.sections && (
                      <ul className="mb-1 ml-3 mt-0.5 border-l border-app-border pl-2">
                        {tab.sections.map((s) => (
                          <li key={s.id}>
                            <a
                              href={`#${s.id}`}
                              className="block rounded-md px-2 py-1.5 text-xs font-medium text-muted transition hover:bg-badge-neutral hover:text-ink"
                            >
                              {s.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <main className="px-4 pb-28 pt-4 lg:pb-8 lg:pl-0 lg:pr-4 lg:pt-6">{children}</main>
        </div>
      ) : (
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:pb-8">{children}</main>
      )}

      {/* Mobile bottom nav — unchanged */}
      {mobileTabs.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-app-border bg-card lg:hidden">
          <div className={`grid ${mobileTabs.length >= 5 ? 'grid-cols-5' : mobileTabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {mobileTabs.map((tab) => (
              <button
                key={tab.id}
                className={`min-h-16 px-1 text-xs font-semibold ${activeTab === tab.id ? 'text-accent' : 'text-muted'}`}
                type="button"
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function ProfileDropdown({ profile, onSignOut }: { profile: Profile; onSignOut?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="inline-flex max-w-[48vw] items-center gap-2 truncate rounded-full border border-input-border bg-card px-3 py-2 text-xs font-bold text-muted shadow-sm transition hover:bg-card-alt"
        type="button"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{profile.firstName} {profile.lastName}</span>
        <ChevronDown size={12} className={`shrink-0 text-muted-light transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-md border border-app-border bg-card py-1 shadow-lg">
          <div className="border-b border-app-border-subtle px-4 py-3">
            <p className="text-sm font-bold">{profile.firstName} {profile.lastName}</p>
            <p className="mt-0.5 text-xs text-muted">{profile.email}</p>
            <p className="mt-1 text-xs font-semibold capitalize text-muted-light">{profile.role}</p>
          </div>
          {onSignOut && (
            <button
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-muted-strong transition hover:bg-card-alt disabled:opacity-60"
              type="button"
              disabled={isSigningOut}
              onClick={async () => {
                setIsSigningOut(true);
                try {
                  await onSignOut();
                } finally {
                  setIsSigningOut(false);
                  setOpen(false);
                }
              }}
            >
              <LogOut size={15} className="text-muted-light" aria-hidden="true" />
              {isSigningOut ? 'Signing out...' : 'Sign Out'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
