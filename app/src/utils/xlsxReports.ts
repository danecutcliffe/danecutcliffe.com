import type ExcelJS from 'exceljs';
import type { ReportCellValue, ReportColumn, ReportModel } from './reportModels';

const COLORS = {
  charcoal: '2B2928',
  header: '3B3532',
  accent: 'E07755',
  accentLight: 'F6E4DB',
  border: 'BFB7B2',
  white: 'FFFFFF',
  error: 'F4CCCC',
  warning: 'FCE4D6',
};

export async function downloadReportXlsx(model: ReportModel, filename: string) {
  const workbook = await buildReportWorkbook(model);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function buildReportWorkbook(model: ReportModel) {
  const ExcelJSModule = await import('exceljs');
  const ExcelRuntime = ExcelJSModule.default;
  const workbook = new ExcelRuntime.Workbook();
  workbook.creator = 'Time Clock';
  workbook.created = new Date();

  const detail = workbook.addWorksheet(model.title, {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  writeReportSheet(detail, model);
  writeSummarySheet(workbook, model);
  model.sheets?.forEach((supplementalSheet) => {
    const sheet = workbook.addWorksheet(supplementalSheet.title, {
      views: [{ state: 'frozen', ySplit: 4 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });
    writeReportSheet(sheet, {
      title: supplementalSheet.title,
      subtitle: supplementalSheet.subtitle ?? model.subtitle,
      columns: supplementalSheet.columns,
      rows: supplementalSheet.rows,
      summary: [],
      exceptions: [],
    });
  });
  if (model.exceptions.length > 0) writeExceptionsSheet(workbook, model);

  return workbook;
}

function writeReportSheet(sheet: ExcelJS.Worksheet, model: ReportModel) {
  const columnCount = model.columns.length;
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.getCell(1, 1).value = model.title;
  sheet.getCell(2, 1).value = model.subtitle;
  sheet.getCell(1, 1).font = { bold: true, size: 18, color: { argb: COLORS.white } };
  sheet.getCell(2, 1).font = { italic: true, size: 11, color: { argb: COLORS.white } };
  sheet.getCell(1, 1).fill = solidFill(COLORS.charcoal);
  sheet.getCell(2, 1).fill = solidFill(COLORS.header);
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 24;

  sheet.columns = model.columns.map((column) => ({
    key: column.key,
    width: column.width,
  }));

  const headerRow = sheet.getRow(4);
  model.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.fill = solidFill(COLORS.header);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });

  model.rows.forEach((row) => {
    const excelRow = sheet.addRow(model.columns.map((column) => formatCellValue(row[column.key], column)));
    const rowKind = typeof row.rowKind === 'string' ? row.rowKind : '';
    model.columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      cell.alignment = { horizontal: column.align ?? 'left', vertical: 'middle', wrapText: column.key === 'notes' };
      cell.border = thinBorder();
      if (column.format === 'hours') cell.numFmt = '0.00';
      if (column.format === 'currency') cell.numFmt = '$#,##0.00';
      if (column.format === 'date') cell.numFmt = 'yyyy-mm-dd';
      if (column.format === 'time') cell.numFmt = 'h:mm AM/PM';
      if (row.entryStatus === 'Open') cell.fill = solidFill(COLORS.warning);
      if (rowKind === 'detail' && index === 0) cell.alignment = { ...cell.alignment, indent: 2 };
      if (rowKind === 'total') {
        cell.font = { bold: true };
        cell.fill = solidFill(COLORS.accentLight);
      }
      if (rowKind === 'grandTotal') {
        cell.font = { bold: true, color: { argb: COLORS.white } };
        cell.fill = solidFill(COLORS.header);
      }
      if (rowKind === 'group') {
        cell.font = { bold: true, color: { argb: COLORS.white } };
        cell.fill = solidFill(COLORS.charcoal);
      }
    });
    if (rowKind === 'group' && columnCount > 1) {
      sheet.mergeCells(excelRow.number, 1, excelRow.number, columnCount);
    }
  });

  const tableEndRow = Math.max(4, 4 + model.rows.length);
  if (model.rows.some((row) => typeof row.rowKind === 'string')) {
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: columnCount },
    };
  } else {
    sheet.addTable({
      name: safeTableName(model.title),
      ref: 'A4',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: model.columns.map((column) => ({ name: column.label, filterButton: true })),
      rows: model.rows.map((row) => model.columns.map((column) => formatCellValue(row[column.key], column))),
    });
  }
  if (model.summary.length > 0) {
    const summaryStart = tableEndRow + 3;
    sheet.mergeCells(summaryStart, 1, summaryStart, Math.min(4, columnCount));
    sheet.getCell(summaryStart, 1).value = 'Summary';
    sheet.getCell(summaryStart, 1).font = { bold: true, color: { argb: COLORS.white } };
    sheet.getCell(summaryStart, 1).fill = solidFill(COLORS.accent);
    model.summary.forEach((item, index) => {
      const row = sheet.getRow(summaryStart + index + 1);
      row.getCell(1).value = item.label;
      row.getCell(2).value = item.value;
      row.getCell(1).font = { bold: true };
      row.getCell(1).fill = solidFill(COLORS.accentLight);
      row.getCell(2).fill = solidFill(COLORS.accentLight);
      row.getCell(1).border = thinBorder();
      row.getCell(2).border = thinBorder();
    });
  }
}

function writeSummarySheet(workbook: ExcelJS.Workbook, model: ReportModel) {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [{ width: 28 }, { width: 18 }];
  sheet.getCell('A1').value = model.title;
  sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: COLORS.white } };
  sheet.getCell('A1').fill = solidFill(COLORS.charcoal);
  sheet.mergeCells('A1:B1');
  sheet.getCell('A2').value = model.subtitle;
  sheet.getCell('A2').font = { italic: true, color: { argb: COLORS.white } };
  sheet.getCell('A2').fill = solidFill(COLORS.header);
  sheet.mergeCells('A2:B2');
  sheet.addRow([]);
  sheet.addRow(['Metric', 'Value']);
  model.summary.forEach((item) => sheet.addRow([item.label, item.value]));
  sheet.getRow(4).font = { bold: true, color: { argb: COLORS.white } };
  sheet.getRow(4).fill = solidFill(COLORS.header);
}

function writeExceptionsSheet(workbook: ExcelJS.Workbook, model: ReportModel) {
  const sheet = workbook.addWorksheet('Exceptions');
  sheet.columns = [{ width: 16 }, { width: 70 }];
  sheet.addRow(['Severity', 'Message']);
  sheet.getRow(1).font = { bold: true, color: { argb: COLORS.white } };
  sheet.getRow(1).fill = solidFill(COLORS.header);
  model.exceptions.forEach((exception) => {
    const row = sheet.addRow([exception.severity, exception.message]);
    row.eachCell((cell) => {
      cell.fill = solidFill(exception.severity === 'blocker' ? COLORS.error : COLORS.warning);
      cell.border = thinBorder();
    });
  });
}

function formatCellValue(value: ReportCellValue, column: ReportColumn) {
  if (value === null) return '';
  if ((column.format === 'date' || column.format === 'time') && typeof value === 'string') return new Date(value);
  return value;
}

function solidFill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } },
  };
}

function safeTableName(title: string) {
  return `${title.replace(/[^A-Za-z0-9]/g, '')}Table`.slice(0, 31);
}
