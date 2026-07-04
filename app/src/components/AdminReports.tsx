import { useEffect, useMemo, useState } from 'react';
import type { AuditLog, JobCode, JobSite, PayPeriodSettings, PayrollGrossUpMultiplier, Profile, TimeEntry } from '../domain/types';
import { getPayPeriodForDate } from '../hooks/usePayPeriodSettings';
import { buildDetailedCsv, downloadCsv } from '../utils/csv';
import { jobDisplayNameById, jobSiteById } from '../utils/jobs';
import { buildLabourCostBreakdownAcrossPayPeriods, type LabourCostPropertyBreakdown } from '../utils/labour';
import { buildDetailedTimecardReport, buildHoursByLocationReport, buildPayrollSummaryReport, type ReportModel } from '../utils/reportModels';
import { buildReportContextEntries, buildReportWarningEntries } from '../utils/reportContext';
import { buildPayrollExportReadiness } from '../utils/reportReadiness';
import { computeTimeSummary } from '../utils/timecardHours';
import { downloadReportXlsx } from '../utils/xlsxReports';
import {
  addDaysToDateKey,
  formatAtlanticDate,
  formatAtlanticDateTime,
  getAtlanticDateKey,
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
type ExportBlock = { title: string; body: string; items?: string[] };

export function AdminReports({ profiles, jobSites, jobCodes, entries, auditLogs, payPeriodSettings, grossUpMultipliers }: AdminReportsProps) {
  const currentPeriod = useMemo(() => getPayPeriodForDate(payPeriodSettings), [payPeriodSettings]);
  const [reportPeriodStart, setReportPeriodStart] = useState(currentPeriod.start);
  const [isLabourCostsOpen, setIsLabourCostsOpen] = useState(true);
  const [openPropertyIds, setOpenPropertyIds] = useState<Record<string, boolean>>({});
  const [reportType, setReportType] = useState<ReportType>('detailed');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [jobCodeIds, setJobCodeIds] = useState<string[]>([]);
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx');
  const [exportBlock, setExportBlock] = useState<ExportBlock | null>(null);
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
  const payPeriodOptions = useMemo(() => buildPayPeriodOptions(payPeriodSettings, entries, currentPeriod.start, reportPeriodStart), [currentPeriod.start, entries, payPeriodSettings, reportPeriodStart]);
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
  const filteredWorkEntries = useMemo(() => filteredEntries.filter((entry) => entry.eventType === 'work'), [filteredEntries]);
  const reportContextEntries = useMemo(
    () => buildReportContextEntries(entries, filteredEntries, filteredWorkEntries, reportPeriodStart, reportPeriodEnd),
    [entries, filteredEntries, filteredWorkEntries, reportPeriodEnd, reportPeriodStart],
  );
  const reportWarningEntries = useMemo(
    () => buildReportWarningEntries(periodEntries, filteredEntries, filteredWorkEntries),
    [filteredEntries, filteredWorkEntries, periodEntries],
  );
  const selectedPeriodReadiness = useMemo(() => buildPayrollExportReadiness(periodEntries, profileById, payPeriodSettings), [payPeriodSettings, periodEntries, profileById]);
  const topPeriodSummary = useMemo(() => calculatePayrollSummary(periodEntries, reportPeople, payPeriodSettings.weeklyOvertimeThresholdHours), [payPeriodSettings.weeklyOvertimeThresholdHours, reportPeople, periodEntries]);
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
  const detailedFilename = `time-detail-${reportPeriodStart}_to_${reportPeriodEnd}.csv`;
  const detailedTimecardModel = useMemo(() => buildDetailedTimecardReport({
    entries: filteredEntries,
    contextEntries: reportContextEntries,
    warningEntries: reportWarningEntries,
    profiles,
    jobSites,
    jobCodes,
    payPeriodSettings,
    periodStart: reportPeriodStart,
    periodEnd: reportPeriodEnd,
  }), [filteredEntries, jobCodes, jobSites, payPeriodSettings, reportContextEntries, reportPeriodEnd, reportPeriodStart, reportWarningEntries, profiles]);
  const detailedCsv = useMemo(() => buildDetailedCsv(detailedTimecardModel), [detailedTimecardModel]);
  const hoursByLocationModel = useMemo(() => buildHoursByLocationReport({
    entries: filteredEntries,
    contextEntries: reportContextEntries,
    warningEntries: reportWarningEntries,
    profiles,
    jobSites,
    jobCodes,
    payPeriodSettings,
    periodStart: reportPeriodStart,
    periodEnd: reportPeriodEnd,
  }), [filteredEntries, jobCodes, jobSites, payPeriodSettings, reportContextEntries, reportPeriodEnd, reportPeriodStart, reportWarningEntries, profiles]);
  const payrollSummaryModel = useMemo(() => buildPayrollSummaryReport({
    entries: filteredEntries,
    contextEntries: reportContextEntries,
    warningEntries: reportWarningEntries,
    profiles,
    jobSites,
    jobCodes,
    payPeriodSettings,
    periodStart: reportPeriodStart,
    periodEnd: reportPeriodEnd,
  }), [filteredEntries, jobCodes, jobSites, payPeriodSettings, reportContextEntries, reportPeriodEnd, reportPeriodStart, reportWarningEntries, profiles]);
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
  const selectedOpenEntryCount = periodEntries.filter((entry) => !entry.clockOut).length;
  const selectedClosedEntryCount = periodEntries.length - selectedOpenEntryCount;
  const displayedPayableHours = topPeriodSummary.netWorkHours;
  const displayedGrossPay = topPeriodSummary.grossPay;
  const displayedOvertimeHours = topPeriodSummary.overtimeHours;
  const maxPropertyLoadedCost = labourBreakdown.properties[0]?.loadedCost ?? 0;

  useEffect(() => {
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
    if (selectedOpenEntryCount > 0) {
      setExportBlock({
        title: 'Cannot export as there are open entries.',
        body: `Close ${selectedOpenEntryCount} open ${selectedOpenEntryCount === 1 ? 'entry' : 'entries'} in this pay period, then export again.`,
      });
      return;
    }
    if (selectedPeriodReadiness.blockers.length > 0) {
      setExportBlock({
        title: 'Cannot export this report yet.',
        body: 'Resolve the payroll setup issue below, then export again.',
        items: selectedPeriodReadiness.blockers,
      });
      return;
    }
    if (exportFormat === 'detailedCsv' && selectedPeriodReadiness.warnings.length > 0) {
      setExportBlock({
        title: 'Cannot export Detailed CSV yet.',
        body: 'Detailed CSV has no Exceptions sheet, so resolve or review the warning below before exporting.',
        items: selectedPeriodReadiness.warnings,
      });
      return;
    }
    if (exportFormat === 'detailedCsv') {
      downloadCsv(detailedFilename, detailedCsv);
      return;
    }
    if (selectedReportModel) downloadReportXlsx(selectedReportModel, selectedXlsxFilename);
  };

  const changePeriodStart = (start: string) => {
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
            <p className="mt-1 text-sm text-muted">{formatAtlanticDate(reportPeriodStart)} - {formatAtlanticDate(reportPeriodEnd)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="min-h-12 rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={() => changePeriodStart(addDaysToDateKey(reportPeriodStart, -payPeriodSettings.lengthDays))}>Previous</button>
            <button className="min-h-12 rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={() => changePeriodStart(addDaysToDateKey(reportPeriodStart, payPeriodSettings.lengthDays))}>Next</button>
            <button className="col-span-2 min-h-12 rounded-md bg-accent px-3 font-bold text-white" type="button" onClick={() => changePeriodStart(currentPeriod.start)}>Current Period</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Payable hours" value={`${displayedPayableHours.toFixed(2)}h`} />
          <Metric label="Gross payroll" value={money(displayedGrossPay)} />
          <Metric label="Overtime" value={`${displayedOvertimeHours.toFixed(2)}h`} />
          <Metric label="Open entries" value={topPeriodSummary.openEntries.toString()} />
          <Metric label="Closed entries" value={selectedClosedEntryCount.toString()} />
        </div>
      </div>

      <div className="rounded-md border border-app-border bg-card p-4 shadow-soft">
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
          {reportType === 'jobs' && <JobReport model={detailedTimecardModel} />}
          {reportType === 'overtime' && <OvertimeReport model={detailedTimecardModel} profiles={reportPeople} />}
        </div>
      </div>

      <AuditTrail auditLogs={auditLogs} profiles={profiles} targetTable={auditTable} onTargetTableChange={setAuditTable} />
      {exportBlock !== null && (
        <ExportBlockedModal
          block={exportBlock}
          onClose={() => setExportBlock(null)}
        />
      )}
    </section>
  );
}

function ExportBlockedModal({ block, onClose }: { block: ExportBlock; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end overflow-hidden bg-black/60 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="export-blocked-title">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-md border border-error-border bg-card p-5 shadow-soft sm:mx-auto sm:max-h-[92vh] sm:max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="export-blocked-title" className="text-xl font-bold text-error-text">{block.title}</p>
            <p className="mt-2 text-sm font-semibold text-muted-strong">{block.body}</p>
            {block.items && block.items.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm font-semibold text-muted-strong">
                {block.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </div>
          <button className="min-h-9 min-w-9 rounded-full border border-input-border px-3 font-bold text-muted-strong" type="button" aria-label="Close export message" onClick={onClose}>X</button>
        </div>
        <button className="mt-5 min-h-11 w-full rounded-md bg-accent px-4 font-bold text-white" type="button" onClick={onClose}>Okay</button>
      </div>
    </div>
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
  const previewRows = model.rows.slice(0, 500);
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

      <div className="mt-4 overflow-x-auto rounded-md border border-app-border">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-card text-xs uppercase text-muted lg:static">
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
              if (row.rowKind === 'property' || row.rowKind === 'group') {
                return (
                  <tr key={index} className={reportRowClass(row)}>
                    <td className={`px-3 py-2 font-bold ${row.rowKind === 'group' ? 'pl-6' : ''}`} colSpan={model.columns.length}>{formatPreviewCell(row.description)}</td>
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
  if (row.rowKind === 'property') return 'bg-ink text-card';
  if (row.rowKind === 'group') return 'bg-badge-neutral';
  if (row.rowKind === 'total') return 'bg-card-alt font-bold';
  if (row.rowKind === 'propertyTotal') return 'bg-badge-neutral font-bold';
  if (row.rowKind === 'grandTotal') return 'bg-accent text-white font-bold';
  return '';
}

function reportCellClass(row: Record<string, unknown>, columnKey: string, align?: 'left' | 'right' | 'center') {
  const alignment = align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : '';
  const indent = columnKey === 'description'
    ? (row.rowKind === 'detail' ? 'pl-10' : row.rowKind === 'total' ? 'pl-6' : '')
    : '';
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
  return <ReportList title="Hours summary" items={profiles.map((profile) => ({ title: name(profile), body: `${computeTimeSummary(entries.filter((entry) => entry.userId === profile.id), profile, weeklyOvertimeThresholdHours).netWorkHours.toFixed(2)} payable hours` }))} />;
}

function JobReport({ model }: { model: ReportModel }) {
  const jobHours = new Map<string, { title: string; paidHours: number }>();

  model.rows.forEach((row) => {
    if (row.entryStatus === 'Open') return;
    const key = `${row.property}|${row.jobCode}|${row.job}`;
    const title = `${row.property} · ${row.jobCode} · ${row.job}`;
    const current = jobHours.get(key) ?? { title, paidHours: 0 };
    current.paidHours += Number(row.paidHours ?? 0);
    jobHours.set(key, current);
  });

  const items = [...jobHours.values()]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((job) => ({ title: job.title, body: `${job.paidHours.toFixed(2)} payable hours` }));

  return <ReportList title="Job hours" items={items} />;
}

function OvertimeReport({ model, profiles }: { model: ReportModel; profiles: Profile[] }) {
  const overtimeByEmployee = new Map<string, number>();

  model.rows.forEach((row) => {
    if (row.entryStatus === 'Open') return;
    const employee = String(row.employee ?? 'Unknown');
    overtimeByEmployee.set(employee, (overtimeByEmployee.get(employee) ?? 0) + Number(row.otHours ?? 0));
  });

  return <ReportList title="Overtime" items={profiles.map((profile) => {
    const employeeName = name(profile);
    return { title: employeeName, body: `${(overtimeByEmployee.get(employeeName) ?? 0).toFixed(2)} overtime hours` };
  })} />;
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
      const summary = computeTimeSummary(employeeEntries, employee, weeklyOvertimeThresholdHours);
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
