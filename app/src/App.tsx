import { useCallback, useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminEmployees } from './components/AdminEmployees';
import { AdminReports } from './components/AdminReports';
import { AdminTimesheets } from './components/AdminTimesheets';
import { AppShell, type AppTab } from './components/AppShell';
import { AuthScreen } from './components/AuthScreen';
import { ClockScreen } from './components/ClockScreen';
import { PasskeySetupPrompt } from './components/PasskeySetupPrompt';
import { SettingsScreen } from './components/SettingsScreen';
import { TimesheetScreen } from './components/TimesheetScreen';
import { appConfig } from './config/env';
import type { AppRole, AuditLog, JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry, TimesheetApproval } from './domain/types';
import { defaultPayPeriodSettings } from './hooks/usePayPeriodSettings';
import { timeClockService } from './services/timeClockServiceFactory';

const service = timeClockService;

const employeeDefaultTab: AppTab = 'clock';
const adminDefaultTab: AppTab = 'dashboard';
const employeeTabs: AppTab[] = ['clock', 'timesheets', 'scope', 'settings'];
const employeeTabsWithoutScope: AppTab[] = ['clock', 'timesheets', 'settings'];
const adminTabs: AppTab[] = ['dashboard', 'timesheets', 'employees', 'reports', 'scope'];

const hasScopeAccess = (profile: Profile | null) => profile?.role === 'admin' || profile?.canAccessScopes !== false;

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('clock');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [jobSites, setJobSites] = useState<JobSite[]>([]);
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [timesheetApprovals, setTimesheetApprovals] = useState<TimesheetApproval[]>([]);
  const [payPeriodSettings, setPayPeriodSettings] = useState<PayPeriodSettings>(() => defaultPayPeriodSettings());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [openWorkEntry, setOpenWorkEntry] = useState<TimeEntry | null>(null);
  const [openBreakEntry, setOpenBreakEntry] = useState<TimeEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const currentProfile = await service.getCurrentProfile();
      setProfile(currentProfile);
      const [allProfiles, sites, jobs, periodSettings] = await Promise.all([service.listProfiles(), service.listJobSites(), service.listJobCodes(), service.getPayPeriodSettings()]);
      setProfiles(allProfiles);
      setJobSites(sites);
      setJobCodes(jobs);
      setPayPeriodSettings(periodSettings);

      if (currentProfile) {
        const isAdmin = currentProfile.role === 'admin';
        if (!currentProfile.isActive) {
          setEntries([]);
          setTimesheetApprovals([]);
          setAuditLogs([]);
          setOpenWorkEntry(null);
          setOpenBreakEntry(null);
          return;
        }
        const [timeEntries, approvals, openWork, openBreak, logs] = await Promise.all([
          service.listTimeEntries(isAdmin ? {} : { userId: currentProfile.id }),
          service.listTimesheetApprovals(isAdmin ? {} : { userId: currentProfile.id }),
          service.getOpenWorkEntry(currentProfile.id),
          service.getOpenBreakEntry(currentProfile.id),
          isAdmin ? service.listAuditLogs() : Promise.resolve([]),
        ]);
        setEntries(timeEntries);
        setTimesheetApprovals(approvals);
        setAuditLogs(logs);
        setOpenWorkEntry(openWork);
        setOpenBreakEntry(openBreak);
        if (isAdmin && !adminTabs.includes(activeTab)) setActiveTab(adminDefaultTab);
        if (!isAdmin && !(hasScopeAccess(currentProfile) ? employeeTabs : employeeTabsWithoutScope).includes(activeTab)) setActiveTab(employeeDefaultTab);
      } else {
        setEntries([]);
        setTimesheetApprovals([]);
        setAuditLogs([]);
        setJobSites([]);
        setOpenWorkEntry(null);
        setOpenBreakEntry(null);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load app data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!service.onAuthStateChange) return undefined;
    return service.onAuthStateChange(() => {
      void refresh();
    });
  }, [refresh]);

  const changeRole = async (role: AppRole) => {
    if (!service.setMockRole) return;
    await service.setMockRole(role);
    setActiveTab(role === 'admin' ? adminDefaultTab : employeeDefaultTab);
    await refresh();
  };

  const signOut = async () => {
    if (!service.signOut) return;
    await service.signOut();
    setActiveTab(employeeDefaultTab);
    await refresh();
  };

  const updatePayPeriodSettings = async (settings: PayPeriodSettings, adminPassword: string) => {
    if (!('updatePayPeriodSettings' in service) || typeof service.updatePayPeriodSettings !== 'function') {
      throw new Error('Pay period settings are not available in this data mode.');
    }
    const nextSettings = await service.updatePayPeriodSettings({ settings, adminPassword });
    setPayPeriodSettings(nextSettings);
    await refresh();
  };

  const isAdmin = profile?.role === 'admin';
  const canSwitchRole = Boolean(service.setMockRole);

  return (
    <AppShell activeTab={activeTab} currentProfile={profile} isLoading={isLoading} onTabChange={setActiveTab} onRoleChange={canSwitchRole ? changeRole : undefined} onSignOut={service.signOut ? signOut : undefined}>
      {isLoading && !profile && <div className="rounded-md border border-app-border bg-card p-6 text-center shadow-soft"><p className="font-semibold text-muted">Loading time clock...</p></div>}
      {loadError && <div className="rounded-md border border-error-border bg-error-bg p-4 font-semibold text-error-text">{loadError}</div>}
      {appConfig.isSupabaseRequestedButMissingConfig && (
        <div className="rounded-md border border-warn-border bg-warn-bg p-4 text-sm font-semibold text-warning">
          Live data mode is selected, but env credentials are missing. The app is using mock data.
        </div>
      )}
      {!isLoading && !profile && service.signIn && <AuthScreen service={service} onSignedIn={refresh} />}

      {profile && !profile.isActive && <InactiveAccountScreen profile={profile} onSignOut={service.signOut ? signOut : undefined} />}

      {profile && profile.isActive && <PasskeySetupPrompt profile={profile} service={service} />}

      {profile && profile.isActive && !isAdmin && activeTab === 'clock' && <ClockScreen profile={profile} service={service} jobSites={jobSites} jobCodes={jobCodes} entries={entries} openWorkEntry={openWorkEntry} openBreakEntry={openBreakEntry} onDataChange={refresh} />}
      {profile && profile.isActive && !isAdmin && activeTab === 'timesheets' && <TimesheetScreen profile={profile} jobSites={jobSites} jobCodes={jobCodes} entries={entries} approvals={timesheetApprovals} payPeriodSettings={payPeriodSettings} />}
      {profile && profile.isActive && !isAdmin && activeTab === 'settings' && <SettingsScreen profile={profile} service={service} onRoleChange={canSwitchRole ? changeRole : undefined} onSignOut={service.signOut ? signOut : undefined} />}

      {profile && profile.isActive && isAdmin && activeTab === 'dashboard' && <AdminDashboard profiles={profiles} jobSites={jobSites} jobCodes={jobCodes} entries={entries} payPeriodSettings={payPeriodSettings} onOpenTimesheets={() => setActiveTab('timesheets')} />}
      {profile && profile.isActive && isAdmin && activeTab === 'timesheets' && <AdminTimesheets adminProfile={profile} profiles={profiles} jobSites={jobSites} jobCodes={jobCodes} entries={entries} approvals={timesheetApprovals} payPeriodSettings={payPeriodSettings} service={service} onDataChange={refresh} />}
      {profile && profile.isActive && isAdmin && activeTab === 'employees' && <AdminEmployees profiles={profiles} jobSites={jobSites} jobCodes={jobCodes} entries={entries} payPeriodSettings={payPeriodSettings} currentProfileId={profile.id} service={service} onPayPeriodSettingsChange={updatePayPeriodSettings} onDataChange={refresh} />}
      {profile && profile.isActive && isAdmin && activeTab === 'reports' && <AdminReports profiles={profiles} jobSites={jobSites} jobCodes={jobCodes} entries={entries} auditLogs={auditLogs} payPeriodSettings={payPeriodSettings} onOpenSettings={() => setActiveTab('employees')} />}

      {profile && profile.isActive && hasScopeAccess(profile) && activeTab === 'scope' && <div id="scope-content-root" />}
    </AppShell>
  );
}

function InactiveAccountScreen({ profile, onSignOut }: { profile: Profile; onSignOut?: () => Promise<void> }) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <section className="mx-auto max-w-md rounded-md border border-warn-border bg-warn-bg p-5 shadow-soft">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-warning">Account inactive</p>
      <h2 className="mt-1 text-2xl font-bold">Time clock access is paused</h2>
      <p className="mt-3 text-sm font-semibold text-muted-strong">
        {profile.firstName} {profile.lastName} is signed in, but this profile is not active. Ask an admin to reactivate the employee before clocking time.
      </p>
      {onSignOut && (
        <button
          className="mt-5 min-h-12 w-full rounded-md border border-warn-border bg-card px-4 font-bold text-warning disabled:opacity-60"
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
