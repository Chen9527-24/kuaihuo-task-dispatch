import ExcelJS from 'exceljs/dist/exceljs.min.js';
import type { CellValue } from 'exceljs';

const TEMPLATE_FILE_NAME = '评论导入模板.xlsx';
const HEADER_KEYWORD = '评论';
const COMMENT_COLUMN_LABEL = '评论内容';

export interface ImportedCommentRecord {
  type: string;
  text: string;
  sort: number | null;
  match_text: string;
  suggest: string;
}

export async function importCommentsFromExcel(file: File): Promise<string[]> {
  const records = await importCommentRecordsFromExcel(file);
  return uniq(records.map((item) => item.text).filter(Boolean));
}

export async function importCommentRecordsFromExcel(file: File): Promise<ImportedCommentRecord[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const mapped = resolveColumnMap(worksheet);
  if (!mapped.text) {
    return [];
  }

  const startRow = mapped.headerRow ? mapped.headerRow + 1 : 1;
  const result: ImportedCommentRecord[] = [];
  for (let rowNumber = startRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const text = mapped.text ? toCellText(row.getCell(mapped.text).value) : '';
    if (!text) continue;

    const type = mapped.type ? toCellText(row.getCell(mapped.type).value) : '';
    const sortText = mapped.sort ? toCellText(row.getCell(mapped.sort).value) : '';
    const matchText = mapped.match_text ? toCellText(row.getCell(mapped.match_text).value) : '';
    const suggest = mapped.suggest ? toCellText(row.getCell(mapped.suggest).value) : '';

    result.push({
      type,
      text,
      sort: toSortNumber(sortText),
      match_text: matchText,
      suggest
    });
  }
  return result;
}

export async function downloadCommentTemplate() {
  const workbook = createBlankCommentWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, TEMPLATE_FILE_NAME);
}

export async function exportCommentsByTemplate(commentTexts: string[]) {
  const workbook = createBlankCommentWorkbook();

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('模板文件无可用工作表');
  }

  const targetColumn = findCommentColumn(worksheet);
  const headerRow = findHeaderRow(worksheet, targetColumn);
  const startRow = headerRow > 0 ? headerRow + 1 : 1;
  const templateStyle = cloneStyle(worksheet.getCell(startRow, targetColumn).style);
  const clearUntil = Math.max(worksheet.rowCount, startRow + commentTexts.length + 100);

  for (let rowIndex = startRow; rowIndex <= clearUntil; rowIndex += 1) {
    worksheet.getCell(rowIndex, targetColumn).value = null;
  }

  commentTexts.forEach((text, index) => {
    const cell = worksheet.getCell(startRow + index, targetColumn);
    if (templateStyle && Object.keys(templateStyle).length) {
      cell.style = cloneStyle(templateStyle);
    }
    cell.value = text;
  });

  const output = await workbook.xlsx.writeBuffer();
  downloadBlob(output, `评论导出_${formatDate()}.xlsx`);
}

function findCommentColumn(worksheet: any): number {
  let targetColumn = 1;
  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount || 10); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let col = 1; col <= Math.max(10, row.cellCount || 10); col += 1) {
      const text = toCellText(row.getCell(col).value);
      if (text.includes(HEADER_KEYWORD)) {
        return col;
      }
    }
  }
  return targetColumn;
}

function findHeaderRow(worksheet: any, column: number): number {
  for (let rowNumber = 1; rowNumber <= Math.min(20, worksheet.rowCount || 20); rowNumber += 1) {
    const text = toCellText(worksheet.getCell(rowNumber, column).value);
    if (text.includes(HEADER_KEYWORD)) {
      return rowNumber;
    }
  }
  return 0;
}

function resolveColumnMap(worksheet: any): {
  headerRow: number;
  type: number;
  text: number;
  sort: number;
  match_text: number;
  suggest: number;
} {
  const columnMap = {
    headerRow: 0,
    type: 0,
    text: 0,
    sort: 0,
    match_text: 0,
    suggest: 0
  };

  for (let rowNumber = 1; rowNumber <= Math.min(20, worksheet.rowCount || 20); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const limit = Math.max(10, row.cellCount || 10);
    for (let col = 1; col <= limit; col += 1) {
      const title = toCellText(row.getCell(col).value).replace(/\s+/g, '');
      if (!title) continue;
      if (title.includes('类型')) columnMap.type = col;
      if (title.includes(COMMENT_COLUMN_LABEL)) columnMap.text = col;
      if (title.includes('配套回复序号')) columnMap.sort = col;
      if (title.includes('配套回复')) columnMap.match_text = col;
      if (title.includes('发布建议')) columnMap.suggest = col;
    }

    if (columnMap.text && !columnMap.headerRow) {
      columnMap.headerRow = rowNumber;
      break;
    }
  }

  if (!columnMap.text) {
    columnMap.text = findCommentColumn(worksheet);
    columnMap.headerRow = findHeaderRow(worksheet, columnMap.text);
  }

  return columnMap;
}

function createBlankCommentWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('评论');
  worksheet.columns = [
    { header: '类型', key: 'type', width: 18 },
    { header: COMMENT_COLUMN_LABEL, key: 'text', width: 60 },
    { header: '配套回复序号', key: 'sort', width: 18 },
    { header: '配套回复', key: 'match_text', width: 48 },
    { header: '发布建议', key: 'suggest', width: 36 }
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  return workbook;
}

function downloadBlob(buffer: ArrayBuffer | BlobPart, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function toCellText(value: CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text.trim();
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text ?? '').join('').trim();
  }
  if (typeof value === 'object' && 'result' in value && value.result != null) return String(value.result).trim();
  return '';
}

function uniq(items: string[]) {
  const cache = new Set<string>();
  const result: string[] = [];
  items.forEach((item) => {
    const text = item.trim();
    if (!text || cache.has(text)) return;
    cache.add(text);
    result.push(text);
  });
  return result;
}

function toSortNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const matched = normalized.match(/-?\d+/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function cloneStyle(style: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(style || {}));
}

function formatDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}`;
}
