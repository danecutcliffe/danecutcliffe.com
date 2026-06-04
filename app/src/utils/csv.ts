import type { ReportCellValue, ReportColumn, ReportModel } from './reportModels';
import { formatAtlanticDateTime } from './time';

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

export function buildDetailedCsv(model: ReportModel): string {
  return toCsv(
    model.columns.map((column) => column.label),
    model.rows.map((row) => model.columns.map((column) => formatReportCell(row[column.key], column))),
  );
}

function formatReportCell(value: ReportCellValue, column: ReportColumn): string | number {
  if (value === null || value === undefined) return '';
  if (column.format === 'time' && typeof value === 'string') return formatAtlanticDateTime(value);
  if (column.format === 'hours' && typeof value === 'number') return value.toFixed(2);
  if (column.format === 'currency' && typeof value === 'number') return value.toFixed(2);
  return value;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
