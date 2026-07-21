import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clipboard, Download, FileText, Loader2, RefreshCcw, Server, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { workoutPeople } from "./workoutPeople";

type ServiceState = "checking" | "online" | "offline";
type GenerateState = "idle" | "loading" | "success" | "error";
type WeekMode = "last" | "custom";

type WorkOutResult = {
  title: string;
  status: string;
  ownerName: string;
  periodRange: string;
  reportFile: string;
  outputDir: string;
  markdown: string;
};

export function WorkOutReport({ onClose }: { onClose: () => void }) {
  const [personKey, setPersonKey] = useState(workoutPeople[0]?.id ?? "");
  const [weekMode, setWeekMode] = useState<WeekMode>("last");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [serviceState, setServiceState] = useState<ServiceState>("checking");
  const [generateState, setGenerateState] = useState<GenerateState>("idle");
  const [result, setResult] = useState<WorkOutResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedPerson = useMemo(() => {
    return workoutPeople.find((person) => person.id === personKey) ?? workoutPeople[0];
  }, [personKey]);

  const weekValue = weekMode === "last" ? "last" : `${startDate}:${endDate}`;
  const canGenerate = Boolean(selectedPerson && (weekMode === "last" || (startDate && endDate && endDate >= startDate))) && generateState !== "loading";

  useEffect(() => {
    void checkHealth();
  }, []);

  async function checkHealth() {
    setServiceState("checking");
    try {
      const response = await fetch("/api/workout-generate?action=health");
      setServiceState(response.ok ? "online" : "offline");
    } catch {
      setServiceState("offline");
    }
  }

  async function generateReport() {
    if (!selectedPerson || !canGenerate) return;
    setGenerateState("loading");
    setError("");
    setCopied(false);
    setResult(null);

    try {
      const response = await fetch("/api/workout-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName: selectedPerson.name,
          week: weekValue,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.error || "生成失败");
      }
      setResult(data);
      setGenerateState("success");
      setServiceState("online");
    } catch (caught) {
      setGenerateState("error");
      setError(caught instanceof Error ? caught.message : "生成失败");
      setServiceState("offline");
    }
  }

  async function copyMarkdown() {
    if (!result?.markdown) return;
    await navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadMarkdown() {
    if (!result?.markdown) return;
    const blob = new Blob([result.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.title || "workout-weekly-report"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="workout-page mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      <motion.header className="workout-hero" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14 }}>
        <div>
          <span className="system-chip">
            <FileText className="h-3.5 w-3.5" />
            WorkOut
          </span>
          <h1>交付周报生成</h1>
          <p>选择人员和周期后，由本地 WorkOut 服务实时取数并生成 Markdown。服务离线时不影响扶摇其他工具。</p>
        </div>
        <div className={`workout-service-card is-${serviceState}`}>
          <span className="panel-icon">{serviceState === "online" ? <Server className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}</span>
          <div>
            <strong>{serviceState === "checking" ? "检查服务中" : serviceState === "online" ? "生成服务在线" : "生成服务离线"}</strong>
            <p>{serviceState === "online" ? "可以提交周报生成任务" : "请确认本地 WorkOut 服务和隧道已启动"}</p>
          </div>
          <button className="icon-button" type="button" aria-label="刷新服务状态" title="刷新服务状态" onClick={checkHealth}>
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
      </motion.header>

      <div className="workout-layout">
        <section className="workout-control-panel">
          <div className="workout-panel-title">
            <span className="panel-icon">
              <FileText className="h-4 w-4" />
            </span>
            <div>
              <h2>生成参数</h2>
              <p>第一版一次只生成一份周报。</p>
            </div>
          </div>

          <label className="grid min-w-0 gap-1.5">
            <span className="text-xs font-medium text-[hsl(var(--muted))]">交付人员</span>
            <select className="field-input" value={personKey} onChange={(event) => setPersonKey(event.target.value)}>
              {workoutPeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.role}
                </option>
              ))}
            </select>
          </label>

          <div className="segmented" aria-label="周报周期">
            <button className={weekMode === "last" ? "is-active" : ""} type="button" onClick={() => setWeekMode("last")}>
              <span>上周</span>
            </button>
            <button className={weekMode === "custom" ? "is-active" : ""} type="button" onClick={() => setWeekMode("custom")}>
              <span>自定义</span>
            </button>
          </div>

          {weekMode === "custom" && (
            <div className="workout-date-grid">
              <label className="grid min-w-0 gap-1.5">
                <span className="text-xs font-medium text-[hsl(var(--muted))]">开始日期</span>
                <input className="field-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="grid min-w-0 gap-1.5">
                <span className="text-xs font-medium text-[hsl(var(--muted))]">结束日期</span>
                <input className="field-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
          )}

          <button className="workout-primary-button" type="button" disabled={!canGenerate} onClick={generateReport}>
            {generateState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            <span>{generateState === "loading" ? "生成中" : "生成 Markdown"}</span>
          </button>

          <button className="text-button" type="button" onClick={onClose}>
            <X className="h-4 w-4" />
            <span>返回首页</span>
          </button>

          {error && <p className="workout-error">{error}</p>}
        </section>

        <section className="workout-preview-panel">
          <div className="workout-panel-title">
            <span className="panel-icon">
              {generateState === "success" ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </span>
            <div>
              <h2>{result?.title ?? "Markdown 预览"}</h2>
              <p>{result ? `${result.ownerName} · ${result.periodRange}` : "生成后会显示周报正文和本机输出路径。"}</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {generateState === "loading" ? (
              <motion.div key="loading" className="workout-skeleton-stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="skeleton h-7 w-56" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-48 w-full" />
              </motion.div>
            ) : result ? (
              <motion.div key="result" className="workout-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="workout-result-actions">
                  <span className="status-badge">{result.status === "passed" ? "校验通过" : "需要复核"}</span>
                  <button className="text-button" type="button" onClick={copyMarkdown}>
                    <Clipboard className="h-4 w-4" />
                    <span>{copied ? "已复制" : "复制"}</span>
                  </button>
                  <button className="workout-primary-button" type="button" onClick={downloadMarkdown}>
                    <Download className="h-4 w-4" />
                    <span>下载</span>
                  </button>
                </div>
                <div className="workout-output-path">
                  <span>本机路径</span>
                  <strong>{result.reportFile}</strong>
                </div>
                <pre className="workout-markdown-preview">{result.markdown}</pre>
              </motion.div>
            ) : (
              <motion.div key="empty" className="workout-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="empty-state-mark" aria-hidden="true">
                  <FileText className="h-5 w-5" />
                </div>
                <h3>等待生成</h3>
                <p>选择人员和周期后点击生成，Markdown 会在这里出现。</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </section>
  );
}
