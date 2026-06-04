import { useEffect, useMemo, useState } from 'react';
import type { AuditLog, JobCode, JobSite, PayPeriodSettings, PayrollGrossUpMultiplier, Profile, TimeEntry } from '../domain/types';
import { getPayPeriodForDate } from '../hooks/usePayPeriodSettings';
import { buildDetailedCsv, downloadCsv } from '../utils/csv';
import { jobDisplayNameById, jobSiteById } from '../utils/jobs';
import { buildLabourCostBreakdownAcrossPayPeriods, type LabourCostPropertyBreakdown } from '../utils/labour';
import { buildDetailedTimecardReport, buildHoursByLocationReport, buildPayrollSummaryReport, type ReportModel } from '../utils/reportModels';
import { downloadReportXlsx } from '../utils/xlsxReports';
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
  grossUpMultipliers: PayrollGrossUpMultiplier[];
}

type ReportType = 'detailed' | 'hoursByLocation' | 'payrollSummary' | 'jobs' | 'overtime';
type FilterKey = 'employees' | 'properties' | 'jobs';
type ExportFormat = 'xlsx' | 'detailedCsv';

export function AdminReports({ profiles, jobSites, jobCodes, entries, auditLogs, payPeriodSettings, grossUpMultipliers }: AdminReportsProps) {
  const currentPeriod = useMemo(() => getPayPeriodForDate(payPeriodSettings), [payPeriodSettings]);
  const [periodStart, setPeriodStart] = useState(currentPeriod.start);
  const [reportPeriodStart, setReportPeriodStart] = useState(currentPeriod.start);
  const [isLabourCostsOpen, setIsLabourCostsOpen] = useState(true);
  const [openPropertyIds, setOpenPropertyIds] = useState<Record<string, boolean>>({});
  const periodEnd = addDaysToDateKey(periodStart, payPeriodSettings.lengthDays - 1);
  const [reportType, setReportType] = useState<ReportType>('detailed');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [jobCodeIds, setJobCodeIds] = useState<string[]>([]);
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx');
  const [auditTable, setAuditTable] = useState('');
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const jobById = useMemo(() => new Map(jobCodes.map((job) => [job.id, job])), [jobCodes]);
  const siteById = useMemo(() => jobSiteById(jobSites), [jobSites]);
  const reportPeople = useMemo(() => [...profiles].sort((a, b) => name(a).localeCompare(name(b))), [profiles]);
  const availableJobCodes = useMemo(
    () => propertyIds.length === 0
      ? jobCodes
      : jobCodes.filter((job) => job.jobSiteId && propertyIds.includes(job.jobSiteId)),
    [jobCodes, propertyIds],
  );
  const reportPeriodEnd = addDaysToDateKey(reportPeriodStart, payPeriodSettings.lengthDays - 1);
  const payPeriodOptions = useMemo(() => buildPayPeriodOptions(payPeriodSettings, entries, currentPeriod.start, periodStart), [currentPeriod.start, entries, payPeriodSettings, periodStart]);
  const topPeriodEntries = useMemo(() => entries.filter((entry) => {
    const key = getAtlanticDateKey(entry.clockIn);
    return key >= periodStart && key <= periodEnd;
  }), [entries, periodEnd, periodStart]);
  const periodEntries = useMemo(() => entries.filter((entry) => {
    const key = getAtlanticDateKey(entry.clockIn);
    return key >= reportPeriodStart && key <= reportPeriodEnd;
  }), [entries, reportPeriodEnd, reportPeriodStart]);
  const filteredEntries = useMemo(
    () => periodEntries.filter((entry) => {
      if (employeeIds.length > 0 && !employeeIds.includes(entry.userId)) return false;
      if (jobCodeIds.length > 0 && (!entry.jobCodeId || !jobCodeIds.includes(entry.jobCodeId))) return false;
      if (propertyIds.length > 0) {
        const job = entry.jobCodeId ? jobById.get(entry.jobCodeId) : null;
        if (!job?.jobSiteId || !propertyIds.includes(job.jobSiteId)) return false;
      }
      return true;
    }),
    [employeeIds, jobById, jobCodeIds, periodEntries, propertyIds],
  );
  const exportableEntries = useMemo(() => filteredEntries.filter((entry) => entry.clockOut), [filteredEntries]);
  const blockers = useMemo(() => buildExportBlockers(filteredEntries, profileById), [filteredEntries, profileById]);
  const topPeriodExportableEntries = useMemo(() => topPeriodEntries.filter((entry) => entry.clockOut), [topPeriodEntries]);
  const topPeriodBlockers = useMemo(() => buildExportBlockers(topPeriodEntries, profileById), [profileById, topPeriodEntries]);
  const topPeriodSummary = useMemo(() => calculatePayrollSummary(topPeriodEntries, reportPeople, payPeriodSettings.weeklyOvertimeThresholdHours), [payPeriodSettings.weeklyOvertimeThresholdHours, reportPeople, topPeriodEntries]);
  const labourBreakdown = useMemo(
    () => buildLabourCostBreakdownAcrossPayPeriods({
      entries,
      profiles,
      jobSites,
      jobCodes,
      grossUpSchedule: grossUpMultipliers,
      payPeriodSettings,
    }),
    [entries, grossUpMultipliers, jobCodes, jobSites, payPeriodSettings, profiles],
  );
  const detailedCsv = buildDetailedCsv({ entries: filteredEntries, profiles, jobSites, jobCodes });
  const detailedFilename = `time-detail-${reportPeriodStart}_to_${reportPeriodEnd}.csv`;
  const detailedTimecardModel = useMemo(() => buildDetailedTimecardReport({
    entries: filteredEntries,
    profiles,
    jobSites,
    jobCodes,
    payPeriodSettings,
    periodStart: reportPeriodStart,
    periodEnd: reportPeriodEnd,
  }), [filteredEntries, jobCodes, jobSites, payPeriodSettings, reportPeriodEnd, reportPeriodStart, profiles]);
  const hoursByLocationModel = useMemo(() => buildHoursByLocationReport({
    entries: filteredEntries,
    profiles,
    jobSites,
    jobCodes,
    payPeriodSettings,
    periodStart: reportPeriodStart,
    periodEnd: reportPeriodEnd,
  }), [filteredEntries, jobCodes, jobSites, payPeriodSettings, reportPeriodEnd, reportPeriodStart, profiles]);
  const payrollSummaryModel = useMemo(() => buildPayrollSummaryReport({
    entries: filteredEntries,
    profiles,
    jobSites,
    jobCodes,
    payPeriodSettings,
    periodStart: reportPeriodStart,
    periodEnd: reportPeriodEnd,
  }), [filteredEntries, jobCodes, jobSites, payPeriodSettings, reportPeriodEnd, reportPeriodStart, profiles]);
  const selectedReportModel = reportType === 'detailed'
    ? detailedTimecardModel
    : reportType === 'hoursByLocation'
      ? hoursByLocationModel
      : reportType === 'payrollSummary'
        ? payrollSummaryModel
        : null;
  const selectedXlsxFilename = `${reportFilenamePrefix(reportType)}-${reportPeriodStart}_to_${reportPeriodEnd}.xlsx`;
  const canExportSelectedReport = exportFormat === 'xlsx'
    ? Boolean(selectedReportModel && selectedReportModel.rows.length > 0)
    : filteredEntries.length > 0;
  const displayedPayableHours = topPeriodSummary.netWorkHours;
  const displayedGrossPay = topPeriodSummary.grossPay;
  const displayedOvertimeHours = topPeriodSummary.overtimeHours;
  const maxPropertyLoadedCost = labourBreakdown.properties[0]?.loadedCost ?? 0;

  useEffect(() => {
    setPeriodStart(currentPeriod.start);
    setReportPeriodStart(currentPeriod.start);
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

  useEffect(() => {
    setJobCodeIds((current) => current.filter((jobCodeId) => availableJobCodes.some((job) => job.id === jobCodeId)));
  }, [availableJobCodes]);

  const handleExport = () => {
    if (exportFormat === 'detailedCsv') {
      downloadCsv(detailedFilename, detailedCsv);
      return;
    }
    if (selectedReportModel) downloadReportXlsx(selectedReportModel, selectedXlsxFilename);
  };

  const changePeriodStart = (start: string) => {
    setPeriodStart(start);
    setReportPeriodStart(start);
  };

  return (
    <section className="space-y-4">
      <div id="labour-costs" className="scroll-mt-20 rounded-md border border-app-border bg-card shadow-soft">
        <button
          className="report-toggle-button flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
          type="button"
          aria-expanded={isLabourCostsOpen}
          onClick={() => setIsLabourCostsOpen(!isLabourCostsOpen)}
        >
          <div className="min-w-0">
            <h2 className="text-2xl font-bold leading-tight">Payroll cost by property</h2>
            <p className="mt-1 text-sm text-muted">
              {labourBreakdown.propertyCount} propert{labourBreakdown.propertyCount === 1 ? 'y' : 'ies'} · {labourBreakdown.jobCount} job code{labourBreakdown.jobCount === 1 ? '' : 's'} · {labourBreakdown.payableHours.toFixed(2)} payable hours
            </p>
            {labourBreakdown.unattributedBreakHours > 0 && (
              <p className="mt-2 rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-sm font-bold text-warning">
                Review needed: {labourBreakdown.unattributedBreakHours.toFixed(2)}h of unpaid break time could not be matched to a work entry.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 self-start sm:self-center">
            <div className="text-left sm:text-right">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Total loaded</p>
              <p className="mt-1 text-2xl font-bold text-warning">{money(labourBreakdown.loadedCost)}</p>
              <p className="text-xs font-semibold text-muted">{money(labourBreakdown.grossPay)} gross payroll</p>
            </div>
            <span className={`report-toggle-icon shrink-0 rounded-full p-1 text-warning transition ${isLabourCostsOpen ? 'rotate-180' : ''}`}>
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold leading-tight">Payroll report period</h2>
            <p className="mt-1 text-sm text-muted">{formatAtlanticDate(periodStart)} - {formatAtlanticDate(periodEnd)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="min-h-12 rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={() => changePeriodStart(addDaysToDateKey(periodStart, -payPeriodSettings.lengthDays))}>Previous</button>
            <button className="min-h-12 rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={() => changePeriodStart(addDaysToDateKey(periodStart, payPeriodSettings.lengthDays))}>Next</button>
            <button className="col-span-2 min-h-12 rounded-md bg-accent px-3 font-bold text-white" type="button" onClick={() => changePeriodStart(currentPeriod.start)}>Current Period</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Payable hours" value={`${displayedPayableHours.toFixed(2)}h`} />
          <Metric label="Gross payroll" value={money(displayedGrossPay)} />
          <Metric label="Overtime" value={`${displayedOvertimeHours.toFixed(2)}h`} />
          <Metric label="Open entries" value={topPeriodSummary.openEntries.toString()} />
          <Metric label="Exportable rows" value={topPeriodExportableEntries.length.toString()} />
        </div>

        {topPeriodBlockers.length > 0 && (
          <div className="mt-4 rounded-md border border-error-border bg-error-bg p-3">
            <p className="text-sm font-bold text-error-text">Resolve before payroll report export</p>
            <ul className="mt-2 space-y-1 text-sm font-semibold text-error-text">
              {topPeriodBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        )}
        {topPeriodBlockers.length === 0 && topPeriodExportableEntries.length > 0 && (
          <p className="mt-4 rounded-md bg-success-bg p-3 text-sm font-bold text-success">
            This pay period is ready for report export. Open entries are excluded from exportable report rows by design.
          </p>
        )}
      </div>

      <div className="rounded-md border border-app-border bg-card p-4 shadow-soft">
        <p className="mb-3 text-sm font-semibold text-muted">Reports and exports use each employee's paid lunch setting and the {payPeriodSettings.weeklyOvertimeThresholdHours}h weekly overtime threshold.</p>
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-4">
          <LabeledSelect
            label="Report Type"
            value={reportType}
            onChange={(value) => setReportType(value as ReportType)}
            options={[
              { value: 'detailed', label: 'Detailed Timecard' },
              { value: 'hoursByLocation', label: 'Hours by Location' },
              { value: 'payrollSummary', label: 'Payroll Summary' },
              { value: 'jobs', label: 'Job Hours' },
              { value: 'overtime', label: 'Overtime' },
            ]}
          />
          <ChecklistFilter filterId="employees" label="Employees" allLabel="All employees" selectedIds={employeeIds} options={reportPeople.map((profile) => ({ id: profile.id, label: name(profile) }))} openFilter={openFilter} onOpenFilterChange={setOpenFilter} onChange={setEmployeeIds} />
          <ChecklistFilter filterId="properties" label="Properties" allLabel="All properties" selectedIds={propertyIds} options={jobSites.map((site) => ({ id: site.id, label: site.name }))} openFilter={openFilter} onOpenFilterChange={setOpenFilter} onChange={setPropertyIds} />
          <ChecklistFilter filterId="jobs" label="Jobs" allLabel="All jobs" selectedIds={jobCodeIds} options={availableJobCodes.map((job) => ({ id: job.id, label: jobDisplayNameById(job.id, jobById, siteById) }))} openFilter={openFilter} onOpenFilterChange={setOpenFilter} onChange={setJobCodeIds} />
          <LabeledSelect
            label="Payroll Period"
            value={reportPeriodStart}
            onChange={setReportPeriodStart}
            options={payPeriodOptions}
          />
          <LabeledSelect
            label="Export Format"
            value={exportFormat}
            onChange={(value) => setExportFormat(value as ExportFormat)}
            options={[
              { value: 'xlsx', label: 'XLSX' },
              { value: 'detailedCsv', label: 'Detailed Time Entries CSV' },
            ]}
          />
          <div className="hidden lg:block" aria-hidden="true" />
          <button className="min-h-12 self-start rounded-md bg-accent px-6 font-bold text-white disabled:opacity-60" type="button" disabled={!canExportSelectedReport} onClick={handleExport}>Export</button>
        </div>
      </div>

      <div id="report-detail" className="scroll-mt-20 min-w-0">
        <div className="min-w-0 rounded-md border border-app-border bg-card p-4 shadow-soft">
          {selectedReportModel && <ReportPreview model={selectedReportModel} />}
          {reportType === 'jobs' && <JobReport entries={filteredEntries} profiles={profiles} jobSites={jobSites} jobCodes={jobCodes} />}
          {reportType === 'overtime' && <OvertimeReport entries={filteredEntries} profiles={reportPeople} weeklyOvertimeThresholdHours={payPeriodSettings.weeklyOvertimeThresholdHours} />}
        </div>
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
  const [openJobKeys, setOpenJobKeys] = useState<Record<string, boolean>>({});

  return (
    <div className="rounded-md border border-app-border bg-card-alt">
      <button className="report-toggle-button flex w-full items-center justify-between gap-3 p-4 text-left" type="button" aria-expanded={isOpen} onClick={onToggle}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{property.propertyName}</h3>
            <span className="rounded-full bg-badge-neutral px-2 py-1 text-xs font-bold text-muted">{property.jobs.length} job code{property.jobs.length === 1 ? '' : 's'}</span>
          </div>
          <p className="mt-1 text-sm text-muted">{property.payableHours.toFixed(2)} payable hours</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-base font-bold text-warning">{money(property.loadedCost)}</p>
            <p className="text-xs font-semibold text-muted">{money(property.grossPay)} gross payroll</p>
          </div>
          <span className={`report-toggle-icon shrink-0 rounded-full p-1 text-muted-light transition ${isOpen ? 'rotate-180' : ''}`}>
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
              <div key={`${property.propertyId}-${job.jobCodeId ?? job.jobCodeLabel}`} className="overflow-hidden rounded-md border border-app-border bg-card">
                <button
                  className="flex w-full flex-wrap items-start justify-between gap-3 rounded-t-md p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  type="button"
                  aria-expanded={openJobKeys[job.jobCodeId ?? job.jobCodeLabel] ?? false}
                  onClick={() => {
                    const jobKey = job.jobCodeId ?? job.jobCodeLabel;
                    setOpenJobKeys((current) => ({ ...current, [jobKey]: !current[jobKey] }));
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold">{job.jobCodeLabel}</p>
                      <span className={`shrink-0 text-muted-light transition ${openJobKeys[job.jobCodeId ?? job.jobCodeLabel] ? 'rotate-180' : ''}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{job.payableHours.toFixed(2)} payable hours</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{money(job.loadedCost)}</p>
                    <p className="text-xs font-semibold text-muted">{money(job.grossPay)} gross payroll</p>
                  </div>
                </button>
                <div className="px-3 pb-3">
                  <div className="h-2 overflow-hidden rounded-full bg-badge-neutral">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${barWidth(job.loadedCost, property.loadedCost)}%` }} />
                  </div>
                </div>
                {openJobKeys[job.jobCodeId ?? job.jobCodeLabel] && (
                  <div className="mx-3 space-y-2 border-t border-app-border-subtle py-3">
                    {job.employees.map((employee) => (
                      <div key={`${job.jobCodeId ?? job.jobCodeLabel}-${employee.profileId}`} className="flex items-baseline gap-2 text-sm">
                        <span className="min-w-0 truncate font-semibold text-muted-strong">{employee.employeeName}</span>
                        <span className="mb-1 min-w-6 flex-1 border-b-2 border-dotted border-muted-light" aria-hidden="true" />
                        <span className="shrink-0 font-bold text-ink">{money(employee.loadedCost)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportPreview({ model }: { model: ReportModel }) {
  const previewRows = model.rows.slice(0, 50);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{model.title}</h2>
          <p className="mt-1 text-sm font-semibold text-muted">{model.subtitle}</p>
        </div>
        <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">{model.rows.length} row{model.rows.length === 1 ? '' : 's'}</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
        {model.summary.map((item) => (
          <Metric key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      {model.exceptions.length > 0 && (
        <div className="mt-4 space-y-2">
          {model.exceptions.map((exception) => (
            <p key={exception.message} className={`rounded-md border p-3 text-sm font-bold ${exception.severity === 'blocker' ? 'border-error-border bg-error-bg text-error-text' : 'border-warn-border bg-warn-bg text-warning'}`}>
              {exception.message}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 max-h-[42rem] overflow-auto rounded-md border border-app-border">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-card text-xs uppercase text-muted">
            <tr>
              {model.columns.map((column) => (
                <th key={column.key} className={`border-b border-app-border px-3 py-2 font-bold ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, index) => {
              if (row.rowKind === 'group') {
                return (
                  <tr key={index} className={reportRowClass(row)}>
                    <td className="px-3 py-2 font-bold" colSpan={model.columns.length}>{formatPreviewCell(row.description)}</td>
                  </tr>
                );
              }

              return (
                <tr key={index} className={`border-b border-app-border-subtle ${reportRowClass(row)}`}>
                  {model.columns.map((column) => (
                    <td key={column.key} className={`px-3 py-2 align-top ${reportCellClass(row, column.key, column.align)}`}>
                      {formatPreviewCell(row[column.key], column.format)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {model.rows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-sm text-muted" colSpan={model.columns.length}>No rows match the selected report filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {model.rows.length > previewRows.length && <p className="mt-2 text-xs font-semibold text-muted">Showing first {previewRows.length} rows. XLSX export includes all {model.rows.length} rows.</p>}
    </>
  );
}

function reportRowClass(row: Record<string, unknown>) {
  if (row.entryStatus === 'Open') return 'bg-warn-bg';
  if (row.rowKind === 'group') return 'bg-ink text-card';
  if (row.rowKind === 'total') return 'bg-card-alt font-bold';
  if (row.rowKind === 'grandTotal') return 'bg-accent text-white font-bold';
  return '';
}

function reportCellClass(row: Record<string, unknown>, columnKey: string, align?: 'left' | 'right' | 'center') {
  const alignment = align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : '';
  const indent = row.rowKind === 'detail' && columnKey === 'description' ? 'pl-8' : '';
  return `${alignment} ${indent}`;
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';
  return (
    <label className={`relative flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-input-border bg-card px-3 py-2 font-semibold focus-within:ring-2 focus-within:ring-accent ${className ?? ''}`}>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-muted">{label}</span>
        <span className="block truncate text-sm text-ink">{selectedLabel}</span>
      </span>
      <span className="shrink-0 text-muted-light" aria-hidden="true">▾</span>
      <select className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ChecklistFilter({
  filterId,
  label,
  allLabel,
  options,
  selectedIds,
  openFilter,
  onOpenFilterChange,
  onChange,
}: {
  filterId: FilterKey;
  label: string;
  allLabel: string;
  options: Array<{ id: string; label: string }>;
  selectedIds: string[];
  openFilter: FilterKey | null;
  onOpenFilterChange: (filter: FilterKey | null) => void;
  onChange: (ids: string[]) => void;
}) {
  const selectedLabel = selectedIds.length === 0 ? allLabel : `${selectedIds.length} selected`;
  const isOpen = openFilter === filterId;
  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]);
  };

  return (
    <div className="relative">
      <button
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-input-border bg-card px-3 py-2 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        type="button"
        aria-expanded={isOpen}
        onClick={() => onOpenFilterChange(isOpen ? null : filterId)}
      >
        <span className="min-w-0">
          <span className="block text-xs font-bold text-muted">{label}</span>
          <span className="block truncate text-sm text-ink">{selectedLabel}</span>
        </span>
        <span className={`text-muted-light transition ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="absolute z-30 mt-2 max-h-80 w-full min-w-72 overflow-auto rounded-md border border-app-border bg-card p-2 shadow-soft">
          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm font-semibold hover:bg-card-alt">
            <input type="checkbox" checked={selectedIds.length === 0} onChange={() => onChange([])} />
            {allLabel}
          </label>
          <div className="my-1 border-t border-app-border-subtle" />
          {options.length === 0 && <p className="px-2 py-2 text-sm font-semibold text-muted">No options available.</p>}
          {options.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm font-semibold hover:bg-card-alt">
              <input type="checkbox" checked={selectedIds.includes(option.id)} onChange={() => toggle(option.id)} />
              <span className="min-w-0 truncate">{option.label}</span>
            </label>
          ))}
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

function HoursReport({ entries, profiles, weeklyOvertimeThresholdHours }: { entries: TimeEntry[]; profiles: Profile[]; weeklyOvertimeThresholdHours: number }) {
  return <ReportList title="Hours summary" items={profiles.map((profile) => ({ title: name(profile), body: `${calculateTimesheetSummary(entries.filter((entry) => entry.userId === profile.id), profile.hourlyRate, new Date(), { paidBreaks: profile.paidBreaks, paidBreakMinutes: profile.paidBreakMinutes, weeklyOvertimeThresholdHours }).netWorkHours.toFixed(2)} payable hours` }))} />;
}

function JobReport({ entries, profiles, jobSites, jobCodes }: { entries: TimeEntry[]; profiles: Profile[]; jobSites: JobSite[]; jobCodes: JobCode[] }) {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const siteById = jobSiteById(jobSites);
  const jobById = new Map(jobCodes.map((job) => [job.id, job]));
  return <ReportList title="Job hours" items={jobCodes.map((job) => ({ title: jobDisplayNameById(job.id, jobById, siteById), body: `${calculateJobPayableHours(entries.filter((entry) => entry.jobCodeId === job.id), profileById).toFixed(2)} payable hours` }))} />;
}

function OvertimeReport({ entries, profiles, weeklyOvertimeThresholdHours }: { entries: TimeEntry[]; profiles: Profile[]; weeklyOvertimeThresholdHours: number }) {
  return <ReportList title="Overtime" items={profiles.map((profile) => ({ title: name(profile), body: `${calculateTimesheetSummary(entries.filter((entry) => entry.userId === profile.id), profile.hourlyRate, new Date(), { paidBreaks: profile.paidBreaks, paidBreakMinutes: profile.paidBreakMinutes, weeklyOvertimeThresholdHours }).overtimeHours.toFixed(2)} overtime hours` }))} />;
}

function ReportList({ title, items }: { title: string; items: Array<{ title: string; body: string }> }) {
  return <><h2 className="text-xl font-bold">{title}</h2><div className="mt-4 grid grid-cols-1 gap-3">{items.map((item) => <div key={item.title} className="min-w-0 rounded-md border border-app-border p-3"><p className="break-words font-bold">{item.title}</p><p className="text-sm text-muted">{item.body}</p></div>)}</div></>;
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
              <div key={log.id} className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[160px_minmax(0,1fr)]">
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

function calculatePayrollSummary(entries: TimeEntry[], employees: Profile[], weeklyOvertimeThresholdHours: number) {
  return employees.reduce(
    (total, employee) => {
      const employeeEntries = entries.filter((entry) => entry.userId === employee.id);
      const summary = calculateTimesheetSummary(employeeEntries, employee.hourlyRate, new Date(), {
        paidBreaks: employee.paidBreaks,
        paidBreakMinutes: employee.paidBreakMinutes,
        weeklyOvertimeThresholdHours,
      });
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

function formatPreviewCell(value: unknown, format?: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'hours' && typeof value === 'number') return value.toFixed(2);
  if (format === 'currency' && typeof value === 'number') return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
  if (format === 'date' && typeof value === 'string') return formatAtlanticDate(value);
  if (format === 'time' && typeof value === 'string') return formatAtlanticDateTime(value).split(', ').pop() ?? value;
  return String(value);
}

function reportFilenamePrefix(reportType: ReportType) {
  if (reportType === 'hoursByLocation') return 'hours-by-location';
  if (reportType === 'payrollSummary') return 'payroll-summary';
  if (reportType === 'jobs') return 'job-hours';
  if (reportType === 'overtime') return 'overtime';
  return 'timecard-detail';
}

function buildPayPeriodOptions(settings: PayPeriodSettings, entries: TimeEntry[], currentPeriodStart: string, selectedPeriodStart: string) {
  const lengthDays = Math.max(1, settings.lengthDays);
  const entryDateKeys = entries.map((entry) => getAtlanticDateKey(entry.clockIn)).sort();
  const earliestDateKey = entryDateKeys[0] ?? currentPeriodStart;
  const earliestPeriodStart = getPayPeriodForDate(settings, earliestDateKey).start;
  const latestStart = selectedPeriodStart > currentPeriodStart ? selectedPeriodStart : currentPeriodStart;
  const options: Array<{ value: string; label: string }> = [];

  for (let start = latestStart, count = 0; start >= earliestPeriodStart && count < 80; start = addDaysToDateKey(start, -lengthDays), count += 1) {
    const end = addDaysToDateKey(start, lengthDays - 1);
    const prefix = start === currentPeriodStart ? 'Current: ' : '';
    options.push({
      value: start,
      label: `${prefix}${formatAtlanticDate(start)} - ${formatAtlanticDate(end)}`,
    });
  }

  if (!options.some((option) => option.value === selectedPeriodStart)) {
    const end = addDaysToDateKey(selectedPeriodStart, lengthDays - 1);
    options.unshift({
      value: selectedPeriodStart,
      label: `${selectedPeriodStart === currentPeriodStart ? 'Current: ' : ''}${formatAtlanticDate(selectedPeriodStart)} - ${formatAtlanticDate(end)}`,
    });
  }

  return options;
}

function formatMultiplier(value: number) {
  return Number(value.toFixed(2)).toString();
}

function barWidth(value: number, max: number) {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(6, Math.min(100, (value / max) * 100));
}
