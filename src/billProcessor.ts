import ExcelJS from "exceljs";
import JSZip from "jszip";

export type GeneralTemplate = "oldBlue" | "newWhite";

export type MappedBillRecord = {
  comment: string;
  platform: string;
  platformStoreId: string;
  storeName: string;
  billDate: string;
  orderCount: string;
  userPaid: string;
  settlementAmount: number;
};

export type FieldMap = {
  platformStoreId: string;
  storeName: string;
  billTime: string;
  amount: string;
};

export type BillProcessResult = {
  fileName: string;
  template: GeneralTemplate;
  sheetName: string;
  totalRows: number;
  successRows: number;
  skippedRows: number;
  fieldMap: FieldMap;
  records: MappedBillRecord[];
  warnings: string[];
  processedAt: string;
};

type RequiredField = "storeId" | "storeName" | "billTime" | "amount";

type RequiredIndexes = Record<RequiredField, number>;

const PLATFORM_NAME = "京东秒送";
const OUTPUT_COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const TEMPLATE_FILES: Record<GeneralTemplate, string> = {
  oldBlue: "templates/general-old-blue.xlsx",
  newWhite: "templates/general-new-white.xlsx",
};

const REQUIRED_FIELD_ALIASES: Record<RequiredField, string[]> = {
  storeId: ["门店编号", "门店id", "门店编码"],
  storeName: ["门店名称", "门店名"],
  billTime: ["账期时间", "账期", "账单时间"],
  amount: ["付款金额(元)", "付款金额", "付款金额（元）", "结算金额"],
};

export function isSupportedBillFile(file: File) {
  return file.name.toLowerCase().endsWith(".xlsx");
}

export async function processJdBillFile(file: File, template: GeneralTemplate): Promise<BillProcessResult> {
  if (!isSupportedBillFile(file)) {
    throw new Error("仅支持 .xlsx 格式的京东账单");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.getWorksheet("结算单下载") ?? workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("账单文件为空，未找到可读取的工作表");
  }

  const headerRow = worksheet.getRow(1);
  const headers = getRowValues(headerRow);
  if (headers.length === 0) {
    throw new Error("账单文件缺少表头");
  }

  const headerMap = buildHeaderMap(headers);
  const indexes = resolveRequiredIndexes(headerMap);
  const fieldMap = {
    platformStoreId: headers[indexes.storeId] ?? "",
    storeName: headers[indexes.storeName] ?? "",
    billTime: headers[indexes.billTime] ?? "",
    amount: headers[indexes.amount] ?? "",
  };

  const records: MappedBillRecord[] = [];
  const warnings: string[] = [];
  let totalRows = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = getRowValues(row);
    const rawStoreId = values[indexes.storeId];
    const rawStoreName = values[indexes.storeName];
    const rawBillTime = values[indexes.billTime];
    const rawAmount = values[indexes.amount];

    if ([rawStoreId, rawStoreName, rawBillTime, rawAmount].every(isBlank)) return;
    totalRows += 1;

    const storeId = textValue(rawStoreId);
    const storeName = textValue(rawStoreName);
    if (!storeId || !storeName) {
      warnings.push(`第${rowNumber}行跳过：门店编号或门店名称为空`);
      return;
    }

    try {
      records.push({
        comment: "",
        platform: PLATFORM_NAME,
        platformStoreId: storeId,
        storeName,
        billDate: formatBillDate(rawBillTime),
        orderCount: "",
        userPaid: "",
        settlementAmount: formatMoney(rawAmount),
      });
    } catch (error) {
      warnings.push(`第${rowNumber}行跳过：${error instanceof Error ? error.message : String(error)}`);
    }
  });

  if (totalRows === 0) {
    throw new Error("账单中没有可处理的数据行");
  }
  if (records.length === 0) {
    throw new Error("所有记录均因数据异常被跳过，请检查账单字段和清洗日志");
  }

  return {
    fileName: file.name,
    template,
    sheetName: worksheet.name,
    totalRows,
    successRows: records.length,
    skippedRows: totalRows - records.length,
    fieldMap,
    records,
    warnings,
    processedAt: formatTimestamp(new Date()),
  };
}

export async function createBillZip(result: BillProcessResult): Promise<Blob> {
  const zip = new JSZip();
  zip.file("通用账单总表.xlsx", await buildGeneralWorkbookBuffer(result.records, result.template));
  zip.file("清洗日志.txt", buildProcessLog(result));

  const usedNames = new Map<string, number>();
  for (const record of result.records) {
    const baseName = `${formatAmount(record.settlementAmount)}_${sanitizeFilename(record.storeName)}_${record.billDate}.xlsx`;
    const fileName = dedupeFileName(baseName, usedNames);
    zip.file(fileName, await buildGeneralWorkbookBuffer([record], result.template));
  }

  return zip.generateAsync({ type: "blob" });
}

export function getTemplateName(template: GeneralTemplate) {
  return template === "oldBlue" ? "旧-蓝" : "新-白";
}

export function formatAmount(value: number) {
  return value.toFixed(2);
}

function buildHeaderMap(headers: string[]) {
  const headerMap = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = normalizeHeaderName(header);
    if (key && !headerMap.has(key)) headerMap.set(key, index);
  });
  return headerMap;
}

function resolveRequiredIndexes(headerMap: Map<string, number>): RequiredIndexes {
  const resolved = {} as Partial<RequiredIndexes>;
  const missing: string[] = [];

  (Object.entries(REQUIRED_FIELD_ALIASES) as [RequiredField, string[]][]).forEach(([field, aliases]) => {
    const found = aliases.map((alias) => headerMap.get(normalizeHeaderName(alias))).find((index) => index !== undefined);
    if (found === undefined) {
      missing.push(aliases.join("/"));
    } else {
      resolved[field] = found;
    }
  });

  if (missing.length > 0) {
    throw new Error(`无法识别必要字段: ${missing.join(", ")}`);
  }

  return resolved as RequiredIndexes;
}

function getRowValues(row: ExcelJS.Row) {
  const values: string[] = [];
  for (let column = 1; column <= row.cellCount; column += 1) {
    values.push(textValue(row.getCell(column).value));
  }
  return values;
}

function normalizeHeaderName(value: unknown) {
  return textValue(value)
    .normalize("NFKC")
    .replace(/[\r\n]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatTimestamp(value);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return textValue(value.result);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part: { text?: string }) => part.text ?? "").join("").trim();
    }
  }
  return String(value).trim();
}

function isBlank(value: unknown) {
  return textValue(value) === "";
}

function formatBillDate(value: unknown) {
  if (value instanceof Date) return toDateText(value);

  const text = textValue(value);
  if (!text) throw new Error("账期时间为空");

  const serial = Number(text);
  if (!Number.isNaN(serial) && serial > 20000 && serial < 80000) {
    return toDateText(excelSerialToDate(serial));
  }

  const normalized = text.slice(0, 10).replace(/\//g, "-");
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) return toDateText(date);
  }

  throw new Error(`无法识别账期时间: ${text}`);
}

function formatMoney(value: unknown) {
  const text = textValue(value).replace(/,/g, "");
  if (!text) throw new Error("付款金额为空");
  const amount = Number(text);
  if (Number.isNaN(amount)) throw new Error(`金额非数值: ${textValue(value)}`);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function toDateText(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function excelSerialToDate(serial: number) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}

function formatTimestamp(date: Date) {
  const dateText = toDateText(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${dateText} ${hours}:${minutes}:${seconds}`;
}

async function buildGeneralWorkbookBuffer(records: MappedBillRecord[], template: GeneralTemplate) {
  const zip = await loadTemplateZip(template);
  const sheetFile = zip.file("xl/worksheets/sheet1.xml");
  if (!sheetFile) throw new Error("通用账单模板缺少 sheet1.xml");

  const sheetXml = await sheetFile.async("string");
  const nextSheetXml = rewriteSheetData(sheetXml, records, template);
  zip.file("xl/worksheets/sheet1.xml", nextSheetXml);
  return zip.generateAsync({ type: "arraybuffer" });
}

async function loadTemplateZip(template: GeneralTemplate) {
  const response = await fetch(getTemplateUrl(template));
  if (!response.ok) {
    throw new Error(`无法读取内置模板: ${getTemplateName(template)}`);
  }
  return JSZip.loadAsync(await response.arrayBuffer());
}

function getTemplateUrl(template: GeneralTemplate) {
  const baseUrl = import.meta.env?.BASE_URL ?? "/";
  return `${baseUrl.replace(/\/?$/, "/")}${TEMPLATE_FILES[template]}`;
}

function rewriteSheetData(sheetXml: string, records: MappedBillRecord[], template: GeneralTemplate) {
  const rows = Array.from(sheetXml.matchAll(/<row\b[\s\S]*?<\/row>/g)).map((match) => match[0]);
  const topRows = rows.filter((rowXml) => getRowNumber(rowXml) < 5);
  const firstTemplateRow = rows.find((rowXml) => getRowNumber(rowXml) === 5) ?? '<row r="5" spans="1:8"></row>';
  const followingTemplateRow =
    template === "newWhite" ? rows.find((rowXml) => getRowNumber(rowXml) === 6) ?? firstTemplateRow : firstTemplateRow;
  const dataRows = records.map((record, index) => buildDataRowXml(record, 5 + index, index === 0 ? firstTemplateRow : followingTemplateRow));
  const sheetDataXml = `<sheetData>${topRows.join("")}${dataRows.join("")}</sheetData>`;
  const withSheetData = sheetXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, sheetDataXml);
  return updateDimension(withSheetData, 4 + records.length);
}

function getRowNumber(rowXml: string) {
  const match = rowXml.match(/\br="(\d+)"/);
  return match ? Number(match[1]) : 0;
}

function buildDataRowXml(record: MappedBillRecord, rowNumber: number, templateRowXml: string) {
  const rowAttributes = rewriteRowAttributes(templateRowXml, rowNumber);
  const styleByColumn = getTemplateCellAttributes(templateRowXml);
  const values: (string | number)[] = [
    record.comment,
    record.platform,
    record.platformStoreId,
    record.storeName,
    record.billDate,
    record.orderCount,
    record.userPaid,
    record.settlementAmount,
  ];

  const cells = OUTPUT_COLUMNS.map((column, index) => buildCellXml(column, rowNumber, values[index], styleByColumn[column] ?? ""));
  return `<row ${rowAttributes}>${cells.join("")}</row>`;
}

function rewriteRowAttributes(rowXml: string, rowNumber: number) {
  const rowStart = rowXml.match(/<row\b([^>]*)>/)?.[1] ?? "";
  const attributes = rowStart
    .replace(/\br="\d+"/, `r="${rowNumber}"`)
    .replace(/\bspans="[^"]*"/, 'spans="1:8"')
    .trim();
  return attributes.includes(`r="${rowNumber}"`) ? attributes : `r="${rowNumber}"${attributes ? ` ${attributes}` : ""}`;
}

function getTemplateCellAttributes(rowXml: string) {
  return OUTPUT_COLUMNS.reduce(
    (attrs, column) => {
      const match = rowXml.match(new RegExp(`<c\\b([^>]*)\\br="${column}\\d+"([^>]*)`));
      if (!match) return attrs;
      attrs[column] = `${match[1]} ${match[2]}`
        .replace(/\br="[A-Z]+\d+"/, "")
        .replace(/\bt="[^"]*"/, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\s*\/+$/, "");
      return attrs;
    },
    {} as Partial<Record<(typeof OUTPUT_COLUMNS)[number], string>>,
  );
}

function buildCellXml(column: string, rowNumber: number, value: string | number, templateAttributes: string) {
  const address = `${column}${rowNumber}`;
  const attributes = templateAttributes ? ` ${templateAttributes}` : "";
  if (typeof value === "number") {
    return `<c r="${address}"${attributes}><v>${formatAmount(value)}</v></c>`;
  }
  if (!value) {
    return `<c r="${address}"${attributes}/>`;
  }
  return `<c r="${address}"${attributes} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function updateDimension(sheetXml: string, endRow: number) {
  return sheetXml.replace(/<dimension ref="([^"]+)"/, (_match, ref: string) => {
    const [start, end = start] = ref.split(":");
    const endColumn = end.match(/[A-Z]+/)?.[0] ?? "H";
    return `<dimension ref="${start}:${endColumn}${endRow}"`;
  });
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildProcessLog(result: BillProcessResult) {
  const lines = [
    `处理时间: ${result.processedAt}`,
    `源文件: ${result.fileName}`,
    `工作表: ${result.sheetName}`,
    `模板: ${getTemplateName(result.template)}`,
    `原始记录数: ${result.totalRows}`,
    `成功记录数: ${result.successRows}`,
    `跳过记录数: ${result.skippedRows}`,
    "",
    "字段映射:",
    `- 平台门店ID <- ${result.fieldMap.platformStoreId}`,
    `- 门店名称 <- ${result.fieldMap.storeName}`,
    `- 账单日期 <- ${result.fieldMap.billTime}`,
    `- 结算金额 <- ${result.fieldMap.amount}`,
    "",
  ];

  if (result.warnings.length > 0) {
    lines.push("警告信息:", ...result.warnings.map((warning) => `- ${warning}`));
  } else {
    lines.push("警告信息: 无");
  }

  return lines.join("\n");
}

function sanitizeFilename(value: string, replacement = "_") {
  const text = value.trim();
  if (!text) return "未命名门店";
  return text.replace(/[<>:"/\\|?*]/g, replacement).replace(/\s+/g, " ").replace(/\.+$/g, "") || "未命名门店";
}

function dedupeFileName(baseName: string, usedNames: Map<string, number>) {
  const count = usedNames.get(baseName) ?? 0;
  usedNames.set(baseName, count + 1);
  if (count === 0) return baseName;
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex === -1) return `${baseName}_${count}`;
  return `${baseName.slice(0, dotIndex)}_${count}${baseName.slice(dotIndex)}`;
}
