import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clipboard, Download, FileText, Loader2, RefreshCcw, Server, Upload, WifiOff, X } from "lucide-react";
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

type GuideImage = {
  src: string;
  alt: string;
};

export function WorkOutReport() {
  const [personKey, setPersonKey] = useState(workoutPeople[0]?.id ?? "");
  const [weekMode, setWeekMode] = useState<WeekMode>("last");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [serviceState, setServiceState] = useState<ServiceState>("checking");
  const [generateState, setGenerateState] = useState<GenerateState>("idle");
  const [result, setResult] = useState<WorkOutResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeGuideImage, setActiveGuideImage] = useState<GuideImage | null>(null);

  const selectedPerson = useMemo(() => {
    return workoutPeople.find((person) => person.id === personKey) ?? workoutPeople[0];
  }, [personKey]);

  const weekValue = weekMode === "last" ? "last" : `${startDate}:${endDate}`;
  const canGenerate = Boolean(selectedPerson && (weekMode === "last" || (startDate && endDate && endDate >= startDate))) && generateState !== "loading";

  useEffect(() => {
    void checkHealth();
  }, []);

  useEffect(() => {
    if (!activeGuideImage) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveGuideImage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeGuideImage]);

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
          ownerUserKey: selectedPerson.userKey,
          week: weekValue,
        }),
      });
      let data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.error || "生成失败");
      }
      if (response.status === 202 && data.jobId) {
        data = await waitForReport(data.jobId);
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

  async function waitForReport(jobId: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const response = await fetch(`/api/workout-generate?jobId=${encodeURIComponent(jobId)}`);
      const data = await response.json();
      if (response.status === 202) continue;
      if (!response.ok) throw new Error(data.detail || data.error || "生成失败");
      return data;
    }
    throw new Error("周报生成时间过长，请稍后刷新页面查看结果。");
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

      <section className="workout-upload-guide" aria-labelledby="workout-upload-guide-title">
        <div className="workout-upload-guide-intro">
          <span className="panel-icon">
            <Upload className="h-4 w-4" />
          </span>
          <div>
            <p>发布到飞书</p>
            <h2 id="workout-upload-guide-title">下载后，上传到飞书文件夹</h2>
          </div>
        </div>
        <ol className="workout-upload-steps">
          <li>
            <span>01</span>
            <div>
              <strong>下载 Markdown</strong>
              <p>周报生成后，点击右侧的“下载”保存 `.md` 文件。</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>打开飞书文件夹</strong>
              <p>进入飞书任意文件夹，点击 `+`，选择“上传文件”。</p>
              <button
                className="workout-upload-figure"
                type="button"
                aria-label="放大查看在飞书文件夹中选择上传文件的截图"
                onClick={() => setActiveGuideImage({ src: "/feishu-upload-guide/choose-upload.png", alt: "在飞书文件夹菜单中选择上传文件" })}
              >
                <img src="/feishu-upload-guide/choose-upload.png" alt="在飞书文件夹菜单中选择上传文件" loading="lazy" />
              </button>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>选择刚下载的文件</strong>
              <p>选中刚保存的 Markdown 文档，上传完成。</p>
              <button
                className="workout-upload-figure"
                type="button"
                aria-label="放大查看选择下载的 Markdown 文档的截图"
                onClick={() => setActiveGuideImage({ src: "/feishu-upload-guide/select-file.png", alt: "在文件选择器中选择下载的 Markdown 文档" })}
              >
                <img src="/feishu-upload-guide/select-file.png" alt="在文件选择器中选择下载的 Markdown 文档" loading="lazy" />
              </button>
            </div>
          </li>
        </ol>
      </section>

      <AnimatePresence>
        {activeGuideImage && (
          <motion.div className="workout-image-lightbox" role="dialog" aria-modal="true" aria-label="飞书上传步骤截图" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="workout-image-lightbox-scrim" type="button" aria-label="关闭图片预览" onClick={() => setActiveGuideImage(null)} />
            <motion.div className="workout-image-lightbox-content" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
              <img src={activeGuideImage.src} alt={activeGuideImage.alt} />
              <button className="icon-button workout-image-lightbox-close" type="button" aria-label="关闭图片预览" title="关闭" onClick={() => setActiveGuideImage(null)}>
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
