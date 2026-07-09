import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Download, FileArchive, FileSpreadsheet, Loader2, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createBillZip,
  formatAmount,
  getTemplateName,
  isSupportedBillFile,
  processJdBillFile,
  type BillProcessResult,
  type GeneralTemplate,
} from "./billProcessor";

type BillProcessorModalProps = {
  open: boolean;
  onClose: () => void;
};

export function BillProcessorModal({ open, onClose }: BillProcessorModalProps) {
  const [template, setTemplate] = useState<GeneralTemplate>("oldBlue");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BillProcessResult | null>(null);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!file) return;
    void runProcess(file, template);
  }, [file, template]);

  async function runProcess(nextFile: File, nextTemplate: GeneralTemplate) {
    setIsProcessing(true);
    setError("");
    setResult(null);
    try {
      setResult(await processJdBillFile(nextFile, nextTemplate));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsProcessing(false);
    }
  }

  function selectFile(nextFile?: File) {
    if (!nextFile) return;
    if (!isSupportedBillFile(nextFile)) {
      setFile(null);
      setResult(null);
      setError("仅支持 .xlsx 格式的京东账单");
      return;
    }
    setFile(nextFile);
  }

  async function downloadZip() {
    if (!result) return;
    setIsDownloading(true);
    setError("");
    try {
      const zip = await createBillZip(result);
      const url = URL.createObjectURL(zip);
      const link = document.createElement("a");
      link.href = url;
      link.download = `京东秒送账单_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDownloading(false);
    }
  }

  function resetModal() {
    setFile(null);
    setResult(null);
    setError("");
    setIsProcessing(false);
    setIsDownloading(false);
    setDragActive(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="bill-modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="bill-modal-scrim" type="button" aria-label="关闭账单处理" onClick={onClose} />
          <motion.section
            className="bill-modal"
            role="dialog"
            aria-label="京东账单处理"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <header className="bill-modal-header">
              <div className="bill-modal-title">
                <span className="panel-icon">
                  <FileSpreadsheet className="h-4 w-4" />
                </span>
                <div>
                  <p>京东秒送账单处理</p>
                  <span>本地解析 · 清洗映射 · 拆分账单 · Zip 下载</span>
                </div>
              </div>
              <button className="icon-button" type="button" aria-label="关闭账单处理" title="关闭" onClick={onClose}>
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="bill-modal-body">
              <section className="bill-control-panel">
                <div className="bill-template-row" aria-label="模板选择">
                  {(["oldBlue", "newWhite"] as GeneralTemplate[]).map((item) => (
                    <button key={item} className={template === item ? "is-active" : ""} type="button" onClick={() => setTemplate(item)}>
                      {getTemplateName(item)}
                    </button>
                  ))}
                </div>

                <button
                  className={`bill-dropzone ${dragActive ? "is-dragging" : ""}`}
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                    selectFile(event.dataTransfer.files[0]);
                  }}
                >
                  <input
                    ref={inputRef}
                    accept=".xlsx"
                    className="sr-only"
                    type="file"
                    onChange={(event) => selectFile(event.target.files?.[0])}
                  />
                  <span className="bill-drop-icon">
                    {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
                  </span>
                  <strong>{file ? file.name : "上传京东 .xlsx 账单"}</strong>
                  <small>{isProcessing ? "正在清洗映射，请稍等" : "点击选择文件，或拖拽到这里"}</small>
                </button>

                <div className="bill-action-row">
                  <button className="text-button" type="button" onClick={resetModal}>
                    清空
                  </button>
                  <button className="bill-download-button" type="button" disabled={!result || isDownloading} onClick={downloadZip}>
                    {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    <span>{isDownloading ? "正在打包" : "下载 Zip"}</span>
                  </button>
                </div>

                <div className="bill-note">
                  <FileArchive className="h-4 w-4" />
                  <span>Zip 内含通用账单总表、清洗日志和每条记录的拆分账单。</span>
                </div>
              </section>

              <section className="bill-preview-panel">
                {error ? <BillError message={error} /> : null}
                {isProcessing ? <BillProcessingSkeleton /> : null}
                {!error && !isProcessing && !result ? <BillEmptyPreview /> : null}
                {!isProcessing && result ? <BillResultPreview result={result} /> : null}
              </section>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BillResultPreview({ result }: { result: BillProcessResult }) {
  const previewRows = result.records.slice(0, 5);

  return (
    <div className="bill-result-stack">
      <div className="bill-kpi-grid">
        <BillKpi label="原始记录" value={String(result.totalRows)} />
        <BillKpi label="成功记录" value={String(result.successRows)} />
        <BillKpi label="跳过记录" value={String(result.skippedRows)} tone={result.skippedRows > 0 ? "warn" : "ok"} />
      </div>

      <section className="bill-map-card">
        <h3>字段映射</h3>
        <div className="bill-map-grid">
          <span>平台门店ID ← {result.fieldMap.platformStoreId}</span>
          <span>门店名称 ← {result.fieldMap.storeName}</span>
          <span>账单日期 ← {result.fieldMap.billTime}</span>
          <span>结算金额 ← {result.fieldMap.amount}</span>
        </div>
      </section>

      <div className="bill-preview-table-wrap">
        <table className="bill-preview-table">
          <thead>
            <tr>
              <th>平台</th>
              <th>门店ID</th>
              <th>门店名称</th>
              <th>账单日期</th>
              <th>结算金额</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((record, index) => (
              <tr key={`${record.platformStoreId}-${record.billDate}-${index}`}>
                <td>{record.platform}</td>
                <td>{record.platformStoreId}</td>
                <td>{record.storeName}</td>
                <td>{record.billDate}</td>
                <td>{formatAmount(record.settlementAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="bill-log-card">
        <h3>清洗日志预览</h3>
        {result.warnings.length > 0 ? (
          <div className="bill-warning-list">
            {result.warnings.slice(0, 6).map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
            {result.warnings.length > 6 && <span>其余 {result.warnings.length - 6} 条将在日志中保留</span>}
          </div>
        ) : (
          <p>警告信息：无</p>
        )}
      </section>
    </div>
  );
}

function BillKpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "warn" }) {
  return (
    <div className={`bill-kpi-card is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BillEmptyPreview() {
  return (
    <div className="bill-empty-preview">
      <div className="field-empty-illustration" aria-hidden="true">
        <FileSpreadsheet className="h-8 w-8" />
      </div>
      <h3>等待账单文件</h3>
      <p>上传京东秒送账单后，这里会展示字段映射、清洗结果和前几条数据。</p>
    </div>
  );
}

function BillProcessingSkeleton() {
  return (
    <div className="bill-skeleton-stack">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
      </div>
      <div className="skeleton h-28" />
      <div className="skeleton h-48" />
    </div>
  );
}

function BillError({ message }: { message: string }) {
  return (
    <div className="bill-error-card">
      <AlertTriangle className="h-5 w-5" />
      <div>
        <h3>处理失败</h3>
        <p>{message}</p>
      </div>
    </div>
  );
}
