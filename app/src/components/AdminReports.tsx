import { useEffect, useMemo, useState } from 'react';
import type { AuditLog, JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import { getPayPeriodForDate } from '../hooks/usePayPeriodSettings';
import { buildDetailedCsv, buildQboCsv, downloadCsv } from '../utils/csv';
import { jobDisplayNameById, jobSiteById } from '../utils/jobs';
import { buildLabourCostBreakdownAcrossPayPeriods, type LabourCostPropertyBreakdown } from '../utils/labour';
import {
  addDaysToDateKey,
  calculateTimesheetSummary,
  formatAtlanticDate,
  formatAtlanticDateTime,
  getAtlanticDateKey,
  getEntryDurationHours,
} from '../utils/time';

interface AdminReportsProps {
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  entries: TimeEntry[];
  auditLogs: AuditLog[];
  payPeriodSettings: PayPeriodSettings;
}

type ReportType = 'detailed' | 'hours' | 'jobs' | 'overtime';
type PreviewType = 'detailed' | 'qbo';

export function AdminReports({ profiles, jobSites, jobCodes, entries, auditLogs, payPeriodSettings }: AdminReportsProps) {
  const currentPeriod = useMemo(() => getPayPeriodForDate(payPeriodSettings), [payPeriodSettings]);
  const [periodStart, setPeriodStart] = useState(currentPeriod.start);
  const [isLabourCostsOpen, setIsLabourCostsOpen] = useState(true);
  const [openPropertyIds, setOpenPropertyIds] = useState<Record<string, boolean>>({});
  const periodEnd = addDaysToDateKey(periodStart, payPeriodSettings.lengthDays - 1);
  const [reportType, setReportType] = useState<ReportType>('detailed');
  const [employeeId, setEmployeeId] = useState('');
  const [jobCodeId, setJobCodeId] = useState('');
  const [auditTable, setAuditTable] = useState('');
  const [csvPreview, setCsvPreview] = useState('');
  const [previewType, setPreviewType] = useState<PreviewType>('qbo');
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const jobById = useMemo(() => new Map(jobCodes.map((job) => [job.id, job])), [jobCodes]);
  const siteById = useMemo(() => jobSiteById(jobSites), [jobSites]);
  const employees = useMemo(() => profiles.filter((profile) => profile.role === 'employee'), [profiles]);
  const periodEntries = useMemo(() => entries.filter((entry) => {
    const key = getAtlanticDateKey(entry.clockIn);
    return key >= periodStart && key <= periodEnd;
  }), [entries, periodEnd, periodStart]);
  const employeeScopedEntries = useMemo(
    () => periodEntries.filter((entry) => !employeeId || entry.userId === employeeId),
    [employeeId, periodEntries],
  );
  const filteredEntries = useMemo(
    () => employeeScopedEntries.filter((entry) => !jobCodeId || entry.jobCodeId === jobCodeId),
    [employeeScopedEntries, jobCodeId],
  );
  const exportableEntries = useMemo(() => filteredEntries.filter((entry) => entry.clockOut), [filteredEntries]);
  const blockers = useMemo(() => buildExportBlockers(filteredEntries, profileById), [filteredEntries, profileById]);
  const summary = useMemo(() => calculatePayrollSummary(filteredEntries, employees), [employees, filteredEntries]);
  const labourBreakdown = useMemo(
    () => buildLabourCostBreakdownAcrossPayPeriods({
      entries,
      profiles,
      jobSites,
      jobCodes,
      laborCostMultiplier: payPeriodSettings.laborCostMultiplier,
      payPeriodSettings,
    }),
    [entries, jobCodes, jobSites, payPeriodSettings, profiles],
  );
  const detailedCsv = buildDetailedCsv({ entries: filteredEntries, profiles, jobSites, jobCodes });
  const qboCsv = buildQboCsv({ entries: exportableEntries, profiles, jobSites, jobCodes });
  const detailedFilename = `time-detail-${periodStart}_to_${periodEnd}.csv`;
  const qboFilename = `qbo-time-${periodStart}_to_${periodEnd}.csv`;
  const displayedPayableHours = jobCodeId ? labourBreakdown.payableHours : summary.netWorkHours;
  const displayedGrossPay = jobCodeId ? labourBreakdown.grossPay : summary.grossPay;
  const displayedOvertimeHours = jobCodeId ? labourBreakdown.overtimeHours : summary.overtimeHours;
  const maxPropertyLoadedCost = labourBreakdown.properties[0]?.loadedCost ?? 0;

  useEffect(() => {
    setPeriodStart(currentPeriod.start);
  }, [currentPeriod.start, payPeriodSettings.lengthDays]);

  useEffect(() => {
    setOpenPropertyIds((current) => {
      if (labourBreakdown.properties.length === 0) return {};

      const next: Record<string, boolean> = {};
      labourBreakdown.properties.forEach((property, index) => {
        next[property.propertyId] = current[property.propertyId] ?? index === 0;
      });
      return next;
    });
  }, [labourBreakdown.properties]);

  const showPreview = (type: PreviewType) => {
    setPreviewType(type);
    setCsvPreview(type === 'qbo' ? qboCsv : detailedCsv);
  };

  return (
    <section className="space-y-4">
      <div id="labour-costs" className="scroll-mt-20 rounded-md border border-app-border bg-card shadow-soft">
        <button
          className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
          type="button"
          aria-expanded={isLabourCostsOpen}
          onClick={() => setIsLabourCostsOpen(!isLabourCostsOpen)}
        >
          <div className="min-w-0">
            <h2 className="text-2xl font-bold leading-tight">Labour cost by property</h2>
            <p className="mt-1 text-sm text-muted">
              {labourBreakdown.propertyCount} propert{labourBreakdown.propertyCount === 1 ? 'y' : 'ies'} · {labourBreakdown.jobCount} job code{labourBreakdown.jobCount === 1 ? '' : 's'} · {labourBreakdown.payableHours.toFixed(2)} payable hours
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 self-start sm:self-center">
            <div className="text-left sm:text-right">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Total loaded</p>
              <p className="mt-1 text-2xl font-bold text-warning">{money(labourBreakdown.loadedCost)}</p>
              <p className="text-xs font-semibold text-muted">{money(labourBreakdown.grossPay)} gross payroll</p>
            </div>
            <span className={`shrink-0 text-warning transition ${isLabourCostsOpen ? 'rotate-180' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
          </div>
        </button>

        {isLabourCostsOpen && (
          <div className="border-t border-app-border-subtle p-4">
            <div className="space-y-3">
              {entries.length === 0 && <p className="rounded-md border border-app-border bg-card-alt p-3 text-sm text-muted">No time entries have been recorded yet.</p>}
              {entries.length > 0 && labourBreakdown.propertyCount === 0 && (
                <p className="rounded-md border border-app-border bg-card-alt p-3 text-sm text-muted">
                  No work entries with property-linked job codes are available to allocate labour cost.
                </p>
              )}
              {labourBreakdown.properties.map((property) => (
                <LabourCostPropertyCard
                  key={property.propertyId}
                  property={property}
                  maxLoadedCost={maxPropertyLoadedCost}
                  isOpen={openPropertyIds[property.propertyId] ?? false}
                  onToggle={() => setOpenPropertyIds((current) => ({ ...current, [property.propertyId]: !current[property.propertyId] }))}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div id="payroll-export" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <h2 className="text-2xl font-bold leading-tight">Payroll export</h2>
            <p className="mt-1 text-sm text-muted">{formatAtlanticDate(periodStart)} - {formatAtlanticDate(periodEnd)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="min-h-12 rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={() => setPeriodStart(addDaysToDateKey(periodStart, -payPeriodSettings.lengthDays))}>Previous</button>
            <button className="min-h-12 rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={() => setPeriodStart(addDaysToDateKey(periodStart, payPeriodSettings.lengthDays))}>Next</button>
            <button className="col-span-2 min-h-12 rounded-md bg-accent px-3 font-bold text-white" type="button" onClick={() => setPeriodStart(currentPeriod.start)}>Current Period</button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Payable hours" value={`${displayedPayableHours.toFixed(2)}h`} />
          <Metric label="Gross payroll" value={money(displayedGrossPay)} />
          <Metric label="Overtime" value={`${displayedOvertimeHours.toFixed(2)}h`} />
          <Metric label="Open entries" value={summary.openEntries.toString()} />
          <Metric label="Exportable rows" value={exportableEntries.length.toString()} />
        </div>

        {blockers.length > 0 && (
          <div className="mt-4 rounded-md border border-error-border bg-error-bg p-3">
            <p className="text-sm font-bold text-error-text">Resolve before QBO export</p>
            <ul className="mt-2 space-y-1 text-sm font-semibold text-error-text">
              {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        )}
        {blockers.length === 0 && exportableEntries.length > 0 && (
          <p className="mt-4 rounded-md bg-success-bg p-3 text-sm font-bold text-success">
            This filtered pay period is ready to export. Open entries are excluded from QBO by design.
          </p>
        )}
      </div>

      <div className="rounded-md border border-app-border bg-card p-4 shadow-soft">
        <p className="mb-3 text-sm font-semibold text-muted">Reports and exports use each employee's paid lunch setting.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <select className="min-h-12 rounded-md border border-input-border bg-card px-3" value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}>
            <option value="detailed">Detailed Time</option>
            <option value="hours">Hours Summary</option>
            <option value="jobs">Job Hours</option>
            <option value="overtime">Overtime</option>
          </select>
          <select className="min-h-12 rounded-md border border-input-border bg-card px-3" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">All employees</option>
            {employees.map((profile) => <option key={profile.id} value={profile.id}>{name(profile)}</option>)}
          </select>
          <select className="min-h-12 rounded-md border border-input-border bg-card px-3" value={jobCodeId} onChange={(event) => setJobCodeId(event.target.value)}>
            <option value="">All jobs</option>
            {jobCodes.map((job) => <option key={job.id} value={job.id}>{jobDisplayNameById(job.id, jobById, siteById)}</option>)}
          </select>
          <button className="min-h-12 rounded-md bg-accent px-4 font-bold text-white" type="button" onClick={() => showPreview('qbo')}>Preview QBO CSV</button>
        </div>
      </div>

      <div id="report-detail" className="scroll-mt-20 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-md border border-app-border bg-card p-4 shadow-soft">
          {reportType === 'detailed' && <DetailedReport entries={filteredEntries} profileById={profileById} jobById={jobById} siteById={siteById} />}
          {reportType === 'hours' && <HoursReport entries={filteredEntries} profiles={employees} />}
          {reportType === 'jobs' && <JobReport entries={filteredEntries} profiles={profiles} jobSites={jobSites} jobCodes={jobCodes} />}
          {reportType === 'overtime' && <OvertimeReport entries={filteredEntries} profiles={employees} />}
        </div>
        <aside id="csv-exports" className="scroll-mt-20 min-w-0 space-y-3 rounded-md border border-app-border bg-card p-4 shadow-soft">
          <h2 className="text-xl font-bold">CSV exports</h2>
          <p className="text-sm text-muted">QBO export uses a common Time Activity CSV shape. QuickBooks may still require QuickBooks Time or an importer app for upload.</p>
          <button className="min-h-12 w-full rounded-md border border-input-border px-4 font-bold" type="button" onClick={() => showPreview('detailed')}>Preview Detailed CSV</button>
          <button className="min-h-12 w-full rounded-md border border-input-border px-4 font-bold" type="button" onClick={() => showPreview('qbo')}>Preview QBO CSV</button>
          <button className="min-h-12 w-full rounded-md border border-input-border px-4 font-bold" type="button" onClick={() => downloadCsv(detailedFilename, detailedCsv)}>Download Detailed CSV</button>
          <button className="min-h-12 w-full rounded-md bg-accent px-4 font-bold text-white disabled:opacity-60" type="button" disabled={blockers.length > 0 || exportableEntries.length === 0} onClick={() => downloadCsv(qboFilename, qboCsv)}>Download QBO CSV</button>
          {csvPreview && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{previewType === 'qbo' ? 'QBO CSV preview' : 'Detailed CSV preview'}</p>
              <pre className="max-h-80 overflow-auto rounded-md bg-ink p-3 text-xs text-card">{csvPreview}</pre>
            </div>
          )}
        </aside>
      </div>

      <AuditTrail auditLogs={auditLogs} profiles={profiles} targetTable={auditTable} onTargetTableChange={setAuditTable} />
    </section>
  );
}

function LabourCostPropertyCard({
  property,
  maxLoadedCost,
  isOpen,
  onToggle,
}: {
  property: LabourCostPropertyBreakdown;
  maxLoadedCost: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-md border border-app-border bg-card-alt">
      <button className="flex w-full items-center justify-between gap-3 p-4 text-left" type="button" aria-expanded={isOpen} onClick={onToggle}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{property.propertyName}</h3>
            <span className="rounded-full bg-badge-neutral px-2 py-1 text-xs font-bold text-muted">{property.jobs.length} job code{property.jobs.length === 1 ? '' : 's'}</span>
          </div>
          <p className="mt-1 text-sm text-muted">{property.payableHours.toFixed(2)} payable hours · {property.workHours.toFixed(2)} worked hours</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-base font-bold text-warning">{money(property.loadedCost)}</p>
            <p className="text-xs font-semibold text-muted">{money(property.grossPay)} gross payroll</p>
          </div>
          <span className={`shrink-0 text-muted-light transition ${isOpen ? 'rotate-180' : ''}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </span>
        </div>
      </button>
      <div className="px-4 pb-4">
        <div className="h-2 overflow-hidden rounded-full bg-badge-neutral">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${barWidth(property.loadedCost, maxLoadedCost)}%` }} />
        </div>
      </div>
      {isOpen && (
        <div className="border-t border-app-border-subtle px-4 py-3">
          <div className="space-y-2">
            {property.jobs.map((job) => (
              <div key={`${property.propertyId}-${job.jobCodeId ?? job.jobCodeLabel}`} className="rounded-md border border-app-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{job.jobCodeLabel}</p>
                    <p className="mt-1 text-sm text-muted">{job.payableHours.toFixed(2)} payable hours · {job.workHours.toFixed(2)} worked hours</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{money(job.loadedCost)}</p>
                    <p className="text-xs font-semibold text-muted">{money(job.grossPay)} gross payroll</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-badge-neutral">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${barWidth(job.loadedCost, property.loadedCost)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailedReport({ entries, profileById, jobById, siteById }: { entries: TimeEntry[]; profileById: Map<string, Profile>; jobById: Map<string, JobCode>; siteById: Map<string, JobSite> }) {
  return (
    <>
      <h2 className="text-xl font-bold">Detailed time</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="p-2">Date</th><th className="p-2">Employee</th><th className="p-2">Job</th><th className="p-2">Type</th><th className="p-2">Notes</th></tr></thead>
          <tbody>
            {entries.map((entry) => <tr key={entry.id} className="border-t border-app-border-subtle"><td className="p-2">{formatAtlanticDateTime(entry.clockIn)}</td><td className="p-2">{name(profileById.get(entry.userId))}</td><td className="p-2">{entry.eventType === 'break' ? 'Break' : jobDisplayNameById(entry.jobCodeId, jobById, siteById)}</td><td className="p-2 capitalize">{entry.eventType}</td><td className="p-2">{entry.notes}</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HoursReport({ entries, profiles }: { entries: TimeEntry[]; profiles: Profile[] }) {
  return <ReportList title="Hours summary" items={profiles.map((profile) => ({ title: name(profile), body: `${calculateTimesheetSummary(entries.filter((entry) => entry.userId === profile.id), profile.hourlyRate, new Date(), { paidBreaks: profile.paidBreaks, paidBreakMinutes: profile.paidBreakMinutes }).netWorkHours.toFixed(2)} payable hours` }))} />;
}

function JobReport({ entries, profiles, jobSites, jobCodes }: { entries: TimeEntry[]; profiles: Profile[]; jobSites: JobSite[]; jobCodes: JobCode[] }) {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const siteById = jobSiteById(jobSites);
  const jobById = new Map(jobCodes.map((job) => [job.id, job]));
  return <ReportList title="Job hours" items={jobCodes.map((job) => ({ title: jobDisplayNameById(job.id, jobById, siteById), body: `${calculateJobPayableHours(entries.filter((entry) => entry.jobCodeId === job.id), profileById).toFixed(2)} payable hours` }))} />;
}

function OvertimeReport({ entries, profiles }: { entries: TimeEntry[]; profiles: Profile[] }) {
  return <ReportList title="Overtime" items={profiles.map((profile) => ({ title: name(profile), body: `${calculateTimesheetSummary(entries.filter((entry) => entry.userId === profile.id), profile.hourlyRate, new Date(), { paidBreaks: profile.paidBreaks, paidBreakMinutes: profile.paidBreakMinutes }).overtimeHours.toFixed(2)} overtime hours` }))} />;
}

function ReportList({ title, items }: { title: string; items: Array<{ title: string; body: string }> }) {
  return <><h2 className="text-xl font-bold">{title}</h2><div className="mt-4 grid gap-3">{items.map((item) => <div key={item.title} className="rounded-md border border-app-border p-3"><p className="font-bold">{item.title}</p><p className="text-sm text-muted">{item.body}</p></div>)}</div></>;
}

function AuditTrail({ auditLogs, profiles, targetTable, onTargetTableChange }: { auditLogs: AuditLog[]; profiles: Profile[]; targetTable: string; onTargetTableChange: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const filteredLogs = auditLogs.filter((log) => !targetTable || log.targetTable === targetTable).slice(0, 25);
  const tableOptions = [...new Set(auditLogs.map((log) => log.targetTable))].sort();

  return (
    <div id="audit-trail" className="scroll-mt-20 rounded-md border border-app-border bg-card shadow-soft">
      <button
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div>
          <h2 className="text-xl font-bold">Audit trail</h2>
          <p className="mt-1 text-sm text-muted">{auditLogs.length} record{auditLogs.length !== 1 ? 's' : ''}</p>
        </div>
        <span className={`text-muted-light transition ${isOpen ? 'rotate-180' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-app-border-subtle p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Recent admin and time clock record changes.</p>
            <select className="min-h-11 rounded-md border border-input-border bg-card px-3" value={targetTable} onChange={(event) => onTargetTableChange(event.target.value)}>
              <option value="">All records</option>
              {tableOptions.map((table) => <option key={table} value={table}>{formatTableName(table)}</option>)}
            </select>
          </div>
          <div className="mt-4 divide-y divide-app-border-subtle">
            {filteredLogs.length === 0 && <p className="text-sm text-muted">No audit records to show yet.</p>}
            {filteredLogs.map((log) => (
              <div key={log.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[160px_minmax(0,1fr)]">
                <p className="text-sm font-semibold text-muted">{formatAtlanticDateTime(log.createdAt)}</p>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${actionClass(log.action)}`}>{formatAction(log.action)}</span>
                    <span className="rounded-full bg-badge-neutral px-2 py-1 text-xs font-bold text-muted">{formatTableName(log.targetTable)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-muted-strong">
                    {name(profileById.get(log.userId ?? ''))} changed record {shortId(log.targetId)}.
                  </p>
                  <p className="mt-1 text-sm text-muted">{describeAuditChange(log)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sublabel, className }: { label: string; value: string; sublabel?: string; className?: string }) {
  return (
    <div className={`rounded-md bg-card-alt p-3 ${className ?? ''}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sublabel && <p className="mt-1 text-xs font-semibold text-muted">{sublabel}</p>}
    </div>
  );
}

function calculatePayrollSummary(entries: TimeEntry[], employees: Profile[]) {
  return employees.reduce(
    (total, employee) => {
      const employeeEntries = entries.filter((entry) => entry.userId === employee.id);
      const summary = calculateTimesheetSummary(employeeEntries, employee.hourlyRate, new Date(), { paidBreaks: employee.paidBreaks, paidBreakMinutes: employee.paidBreakMinutes });
      return {
        netWorkHours: total.netWorkHours + summary.netWorkHours,
        overtimeHours: total.overtimeHours + summary.overtimeHours,
        grossPay: total.grossPay + summary.grossPay,
        openEntries: total.openEntries + employeeEntries.filter((entry) => !entry.clockOut).length,
      };
    },
    { netWorkHours: 0, overtimeHours: 0, grossPay: 0, openEntries: 0 },
  );
}

function buildExportBlockers(entries: TimeEntry[], profileById: Map<string, Profile>) {
  const blockers: string[] = [];
  const openCount = entries.filter((entry) => !entry.clockOut).length;
  const missingJobCount = entries.filter((entry) => entry.eventType === 'work' && !entry.jobCodeId).length;
  const missingProfileCount = entries.filter((entry) => !profileById.has(entry.userId)).length;
  const missingRateNames = [...new Set(entries
    .filter((entry) => entry.eventType === 'work')
    .map((entry) => profileById.get(entry.userId))
    .filter((profile): profile is Profile => profile !== undefined && profile.role === 'employee' && profile.hourlyRate <= 0)
    .map(name))];

  if (openCount > 0) blockers.push(`${openCount} open time ${openCount === 1 ? 'entry' : 'entries'}`);
  if (missingJobCount > 0) blockers.push(`${missingJobCount} work ${missingJobCount === 1 ? 'entry is' : 'entries are'} missing a job code`);
  if (missingProfileCount > 0) blockers.push(`${missingProfileCount} ${missingProfileCount === 1 ? 'entry has' : 'entries have'} no employee profile`);
  if (missingRateNames.length > 0) blockers.push(`Missing pay rate: ${missingRateNames.join(', ')}`);

  return blockers;
}

function name(profile?: Profile) {
  return profile ? `${profile.firstName} ${profile.lastName}` : 'Unknown';
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatAction(action: string) {
  if (action === 'insert') return 'Created';
  if (action === 'update') return 'Updated';
  if (action === 'delete') return 'Deleted';
  return action.replaceAll('_', ' ');
}

function actionClass(action: string) {
  if (action === 'delete') return 'bg-error-bg text-error-text';
  if (action === 'insert') return 'bg-success-bg text-success';
  return 'bg-warn-bg text-warning';
}

function formatTableName(table: string) {
  return table.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatFieldName(field: string) {
  return field.replaceAll('_', ' ');
}

function describeAuditChange(log: AuditLog) {
  if (log.action === 'insert') return summarizeFields(log.newValues, 'Created with');
  if (log.action === 'delete') return summarizeFields(log.oldValues, 'Deleted record with');

  const oldValues = log.oldValues ?? {};
  const newValues = log.newValues ?? {};
  const changedFields = Object.keys(newValues).filter((key) => {
    if (['updated_at', 'created_at'].includes(key)) return false;
    return JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key]);
  });

  if (changedFields.length === 0) return 'No visible business fields changed.';
  return `Changed ${changedFields.slice(0, 6).map(formatFieldName).join(', ')}${changedFields.length > 6 ? ` and ${changedFields.length - 6} more` : ''}.`;
}

function summarizeFields(values: Record<string, unknown> | null | undefined, prefix: string) {
  if (!values) return `${prefix} no captured details.`;
  const fields = Object.keys(values).filter((key) => !['id', 'updated_at', 'created_at'].includes(key)).slice(0, 5);
  if (fields.length === 0) return `${prefix} no captured details.`;
  return `${prefix} ${fields.map(formatFieldName).join(', ')}.`;
}

function calculateJobPayableHours(entries: TimeEntry[], profileById: Map<string, Profile>) {
  return Math.max(0, entries.reduce((total, entry) => {
    const profile = profileById.get(entry.userId);
    const duration = getEntryDurationHours(entry);
    if (entry.eventType === 'break') {
      const unpaidBreakHours = profile?.paidBreaks ? Math.max(0, duration - profile.paidBreakMinutes / 60) : duration;
      return total - unpaidBreakHours;
    }
    return total + duration;
  }, 0));
}

function money(value: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value);
}

function formatMultiplier(value: number) {
  return Number(value.toFixed(2)).toString();
}

function barWidth(value: number, max: number) {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(6, Math.min(100, (value / max) * 100));
}
