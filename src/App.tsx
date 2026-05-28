import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardList,
  Columns3,
  Database,
  ListFilter,
  Loader2,
  Moon,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Sun,
  WalletCards,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "./analytics";
import { fieldDefinitions, type FieldDefinition } from "./fieldDefinitions";

type PlatformId = "wechat" | "alipay" | "meituanTakeout" | "taobaoFlash" | "jdInstant" | "douyinLocal" | "meituanGroup";
type ViewMode = "board" | "list" | "calendar";
type ThemeMode = "dark" | "light";

type PlatformConfig = {
  id: PlatformId;
  name: string;
  defaultTerm: number;
  termOptions: number[];
  badge: string;
  accent: string;
};

type PlatformForm = {
  startDate: string;
  endDate: string;
  amount: string;
  commissionRate: string;
  term: number;
};

type DetailRow = {
  platform: PlatformConfig;
  startDate: string;
  endDate: string;
  amount: number;
  commission: number;
  commissionRate: number;
  storeAmount: number;
  term: number;
  arrivalDate: string;
};

type ValidationMap = Partial<Record<PlatformId, Partial<Record<keyof PlatformForm, string>>>>;

const fieldCategories = ["全部", "营业中心", "财务中心", "轻量核算", "资金/到账", "服务费/佣金", "余额/提现", "订阅/台账", "对账/异常"];

const platforms: PlatformConfig[] = [
  {
    id: "wechat",
    name: "微信",
    defaultTerm: 1,
    termOptions: [1],
    badge: "WX",
    accent: "from-emerald-300 via-cyan-300 to-sky-400",
  },
  {
    id: "alipay",
    name: "支付宝",
    defaultTerm: 1,
    termOptions: [1],
    badge: "ALI",
    accent: "from-violet-300 via-fuchsia-300 to-cyan-300",
  },
  {
    id: "meituanTakeout",
    name: "美团外卖",
    defaultTerm: 3,
    termOptions: [3],
    badge: "MT",
    accent: "from-yellow-200 via-amber-300 to-cyan-300",
  },
  {
    id: "taobaoFlash",
    name: "淘宝闪购",
    defaultTerm: 3,
    termOptions: [3],
    badge: "TB",
    accent: "from-orange-300 via-rose-300 to-fuchsia-300",
  },
  {
    id: "jdInstant",
    name: "京东秒送",
    defaultTerm: 1,
    termOptions: [1, 3],
    badge: "JD",
    accent: "from-rose-300 via-red-300 to-sky-300",
  },
  {
    id: "douyinLocal",
    name: "抖音来客",
    defaultTerm: 5,
    termOptions: [5],
    badge: "DY",
    accent: "from-neutral-100 via-cyan-300 to-pink-300",
  },
  {
    id: "meituanGroup",
    name: "美团团购",
    defaultTerm: 3,
    termOptions: [3, 28, 1],
    badge: "TG",
    accent: "from-lime-200 via-yellow-300 to-emerald-300",
  },
];

const today = new Date();
const isoToday = toDateInput(today);

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
  }).format(value);
}

function formatDate(dateText: string) {
  if (!dateText) return "-";
  const date = new Date(`${dateText}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);
}

function buildInitialForms(): Record<PlatformId, PlatformForm> {
  return platforms.reduce(
    (forms, platform) => {
      forms[platform.id] = {
        startDate: isoToday,
        endDate: isoToday,
        amount: "",
        commissionRate: "0",
        term: platform.defaultTerm,
      };
      return forms;
    },
    {} as Record<PlatformId, PlatformForm>,
  );
}

function resetPlatformForm(platform: PlatformConfig): PlatformForm {
  return {
      startDate: isoToday,
      endDate: isoToday,
      amount: "",
      commissionRate: "0",
      term: platform.defaultTerm,
  };
}

function getPlatform(id: PlatformId) {
  return platforms.find((item) => item.id === id)!;
}

function termText(options: number[]) {
  return options.map((item) => `T+${item}`).join(" / ");
}

function toggleItem<T>(items: T[], item: T) {
  return items.includes(item) ? items.filter((current) => current !== item) : [...items, item];
}

function ensureTermForPlatform(form: PlatformForm, platform: PlatformConfig): PlatformForm {
  if (platform.termOptions.includes(form.term)) return form;
  return { ...form, term: platform.defaultTerm };
}

function initializeSelectedForm(current: Record<PlatformId, PlatformForm>, id: PlatformId) {
  const platform = getPlatform(id);
  return {
    ...current,
    [id]: ensureTermForPlatform(current[id] ?? resetPlatformForm(platform), platform),
  };
}

function validate(selected: PlatformId[], forms: Record<PlatformId, PlatformForm>) {
  const errors: ValidationMap = {};

  selected.forEach((id) => {
    const form = forms[id];
    const rowErrors: Partial<Record<keyof PlatformForm, string>> = {};
    const amount = Number(form.amount);

    if (form.amount.trim() === "") rowErrors.amount = "amount-required";
    if (form.amount.trim() !== "" && (Number.isNaN(amount) || amount < 0)) {
      rowErrors.amount = "金额不能小于 0";
    }
    const commissionRate = Number(form.commissionRate);
    if (form.commissionRate.trim() === "") rowErrors.commissionRate = "请输入抽佣比例";
    if (form.commissionRate.trim() !== "" && (Number.isNaN(commissionRate) || commissionRate < 0)) {
      rowErrors.commissionRate = "比例不能小于 0";
    }
    if (form.endDate < form.startDate) rowErrors.endDate = "结束日期不能早于开始日期";
    if (form.term < 0) rowErrors.term = "账期不能小于 0";

    if (Object.keys(rowErrors).length > 0) errors[id] = rowErrors;
  });

  return errors;
}

function EmptyIllustration() {
  return (
    <svg viewBox="0 0 220 150" role="img" aria-label="空状态插画" className="mx-auto h-28 w-full max-w-[220px]">
      <defs>
        <linearGradient id="emptyGradient" x1="35" x2="178" y1="22" y2="128">
          <stop stopColor="hsl(var(--accent-a))" />
          <stop offset="1" stopColor="hsl(var(--accent-b))" />
        </linearGradient>
      </defs>
      <path d="M33 111c20-45 45-72 78-73 31-1 61 21 75 60 7 20-6 35-28 35H59c-21 0-33-8-26-22Z" fill="url(#emptyGradient)" opacity=".18" />
      <rect x="58" y="45" width="105" height="70" rx="8" fill="hsl(var(--surface-strong))" stroke="hsl(var(--border))" />
      <path d="M75 67h68M75 84h43M75 101h54" stroke="hsl(var(--muted))" strokeWidth="6" strokeLinecap="round" opacity=".55" />
      <circle cx="157" cy="42" r="16" fill="url(#emptyGradient)" />
      <path d="m151 42 4 4 9-10" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M41 122h139" stroke="hsl(var(--border))" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="glass-card min-h-[132px] overflow-hidden p-4">
      <div className="skeleton h-5 w-24" />
      <div className="mt-5 grid gap-3">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-8 w-32" />
      </div>
    </div>
  );
}

export function App() {
  const [selected, setSelected] = useState<PlatformId[]>([]);
  const [forms, setForms] = useState<Record<PlatformId, PlatformForm>>(buildInitialForms);
  const [filters, setFilters] = useState({ start: "", end: "" });
  const [view, setView] = useState<ViewMode>("board");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isLoading, setIsLoading] = useState(true);
  const [fieldDrawerOpen, setFieldDrawerOpen] = useState(false);
  const trackedCalculationKey = useRef("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    trackEvent("page_view", { page: "revenue_to_card" });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 520);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const timer = window.setTimeout(() => setIsLoading(false), 260);
    return () => window.clearTimeout(timer);
  }, [selected, forms, filters]);

  const errors = useMemo(() => validate(selected, forms), [selected, forms]);
  const hasErrors = Object.keys(errors).length > 0;

  const details = useMemo<DetailRow[]>(() => {
    if (hasErrors) return [];

    return selected.map((id) => {
      const platform = getPlatform(id);
      const form = forms[id];
      const amount = Number(form.amount);
      const commissionRate = Number(form.commissionRate || 0);
      const commission = amount * (commissionRate / 100);
      const storeAmount = Math.max(amount - commission, 0);
      return {
        platform,
        startDate: form.startDate,
        endDate: form.endDate,
        amount,
        commission,
        commissionRate,
        storeAmount,
        term: form.term,
        arrivalDate: addDays(form.endDate, form.term),
      };
    });
  }, [forms, hasErrors, selected]);

  const filteredDetails = useMemo(() => {
    return details.filter((item) => {
      if (filters.start && item.arrivalDate < filters.start) return false;
      if (filters.end && item.arrivalDate > filters.end) return false;
      return true;
    });
  }, [details, filters]);

  const summary = useMemo(() => {
    const groups = new Map<string, { date: string; total: number; platforms: string[] }>();

    filteredDetails.forEach((item) => {
      const current = groups.get(item.arrivalDate) ?? {
        date: item.arrivalDate,
        total: 0,
        platforms: [],
      };
      current.total += item.storeAmount;
      current.platforms.push(item.platform.name);
      groups.set(item.arrivalDate, current);
    });

    return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredDetails]);

  const totalAmount = filteredDetails.reduce((sum, item) => sum + item.storeAmount, 0);
  const commissionTotal = filteredDetails.reduce((sum, item) => sum + item.commission, 0);
  const earliestArrival = summary[0]?.date ?? "-";
  const activeStep = selected.length === 0 ? 0 : hasErrors || filteredDetails.length === 0 ? 1 : 2;

  useEffect(() => {
    if (hasErrors || details.length === 0) return;
    const calculationKey = details.map((item) => `${item.platform.id}:${item.term}`).join("|");
    if (trackedCalculationKey.current === calculationKey) return;
    trackedCalculationKey.current = calculationKey;
    trackEvent("calculation_ready", {
      platform_count: details.length,
      result_count: details.length,
      selected_platforms: details.map((item) => item.platform.id),
    });
  }, [details, hasErrors]);

  function togglePlatform(id: PlatformId) {
    setSelected((current) => toggleItem(current, id));
    setForms((current) => initializeSelectedForm(current, id));
    trackEvent("platform_selected", {
      platform: id,
      selected: !selected.includes(id),
    });
  }

  function updateForm(id: PlatformId, patch: Partial<PlatformForm>) {
    setForms((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function resetAll() {
    setSelected([]);
    setForms(buildInitialForms());
    setFilters({ start: "", end: "" });
    setView("board");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[hsl(var(--bg))] text-[hsl(var(--text))]">
      <div className="workspace-shell">
        <header className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <section className="hero-panel">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="eyebrow-chip">
                  <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--accent-b))]" />
                  Revenue Desk
                </span>
                <span>{isoToday}</span>
              </div>
              <h1>营收到卡轻量核算工具</h1>
              <p>把多平台结算金额扣除品牌抽佣后，按 T+N 账期转换成门店实际到卡节奏。</p>
            </div>

            <div className="hero-actions">
              <button className="field-guide-button" type="button" onClick={() => setFieldDrawerOpen(true)}>
                <BookOpen className="h-4 w-4" />
                <span>字段说明</span>
              </button>
              <button className="icon-button" type="button" aria-label="重置" title="重置" onClick={resetAll}>
                <RefreshCcw className="h-4 w-4" />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="切换主题"
                title="切换主题"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </section>

        </header>

        <section className="process-grid mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <StepIndicator
            active={activeStep >= 0}
            current={activeStep === 0}
            icon={<Plus className="h-4 w-4" />}
            index={1}
            meta={`${selected.length}/${platforms.length} 已选`}
            title="选平台"
            text="微信 / 支付宝"
          />
          <div className="operation-slot">
            <Panel title="1 选择平台" icon={<Plus className="h-4 w-4" />}>
              <div className="platform-grid">
                {platforms.map((platform) => {
                  const active = selected.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      className={`platform-toggle ${active ? "is-active" : ""}`}
                      onClick={() => togglePlatform(platform.id)}
                    >
                      <span className={`badge-gradient bg-gradient-to-br ${platform.accent}`}>{platform.badge}</span>
                      <span className="min-w-0 text-left">
                        <span className="block text-sm font-semibold">{platform.name}</span>
                        <span className="block text-xs text-[hsl(var(--muted))]">{termText(platform.termOptions)}</span>
                      </span>
                      {active && <Check className="ml-auto h-4 w-4 text-[hsl(var(--accent-b))]" />}
                    </button>
                  );
                })}
              </div>
            </Panel>
          </div>

          <StepIndicator
            active={activeStep >= 1}
            current={activeStep === 1}
            icon={<WalletCards className="h-4 w-4" />}
            index={2}
            meta={`${Object.keys(errors).length} 项待处理`}
            title="录数据"
            text="日期 · 金额 · 账期"
          />
          <div className="operation-slot">
            {selected.length === 0 ? (
              <Panel title="2 录入金额与账期" icon={<WalletCards className="h-4 w-4" />}>
                <EmptyState title="还没有选择平台" action="先选择微信或支付宝" />
              </Panel>
            ) : (
              <Panel title="2 录入金额与账期" icon={<WalletCards className="h-4 w-4" />}>
                <div className="entry-grid">
                  {selected.map((id) => {
                    const platform = getPlatform(id);
                    const form = forms[id];
                    const platformErrors = errors[id] ?? {};
                    const arrival = platformErrors.endDate || platformErrors.term ? "-" : addDays(form.endDate, form.term);

                    return (
                      <motion.section
                        layout
                        key={id}
                        className="entry-card task-card"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`badge-gradient bg-gradient-to-br ${platform.accent}`}>{platform.badge}</span>
                            <div className="min-w-0">
                              <h2 className="text-base font-semibold">{platform.name}</h2>
                              <p className="text-xs text-[hsl(var(--muted))]">预计到卡 {arrival}</p>
                            </div>
                          </div>
                          <span className="status-badge">T+{form.term}</span>
                        </div>

                        <div className="grid gap-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="营收开始">
                              <input
                                className="field-input"
                                type="date"
                                value={form.startDate}
                                onChange={(event) => updateForm(id, { startDate: event.target.value })}
                              />
                            </Field>
                            <Field label="营收结束" error={platformErrors.endDate}>
                              <input
                                className="field-input"
                                type="date"
                                value={form.endDate}
                                onChange={(event) => updateForm(id, { endDate: event.target.value })}
                              />
                            </Field>
                          </div>
                          <div className="entry-finance-grid">
                            <Field label="结算金额" error={platformErrors.amount === "amount-required" ? undefined : platformErrors.amount}>
                              <input
                              className="field-input"
                              inputMode="decimal"
                              min="0"
                              placeholder={platformErrors.amount === "amount-required" ? "请输入结算金额" : "0.00"}
                                type="number"
                                value={form.amount}
                                onChange={(event) => updateForm(id, { amount: event.target.value })}
                              />
                            </Field>
                            <Field label="品牌抽佣%" error={platformErrors.commissionRate}>
                              <input
                                className="field-input"
                                inputMode="decimal"
                                min="0"
                                placeholder="0"
                                type="number"
                                value={form.commissionRate}
                                onChange={(event) => updateForm(id, { commissionRate: event.target.value })}
                              />
                            </Field>
                            {platform.termOptions.length > 1 ? (
                              <Field label="账期" error={platformErrors.term}>
                                <select
                                  className="field-input"
                                  value={form.term}
                                  onChange={(event) => updateForm(id, { term: Number(event.target.value) })}
                                >
                                  {platform.termOptions.map((term) => (
                                    <option key={term} value={term}>
                                      T+{term}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            ) : (
                              <Field label="账期" error={platformErrors.term}>
                                <input
                                  className="field-input"
                                  min="0"
                                  type="number"
                                  value={form.term}
                                  onChange={(event) => updateForm(id, { term: Number(event.target.value) })}
                                />
                              </Field>
                            )}
                          </div>
                        </div>
                      </motion.section>
                    );
                  })}
                </div>
              </Panel>
            )}
          </div>

          <StepIndicator
            active={activeStep >= 2}
            current={activeStep === 2}
            icon={<CalendarDays className="h-4 w-4" />}
            index={3}
            meta={`${filteredDetails.length} 条结果`}
            title="看到账"
            text="明细 / 汇总 / 日历"
          />
          <div className="operation-slot">
            <Panel
              title="3 查看到账结果"
              icon={<Columns3 className="h-4 w-4" />}
              action={
                <div className="segmented" role="tablist" aria-label="结果视图">
                  {[
                    ["board", "看板", Columns3],
                    ["list", "列表", ClipboardList],
                    ["calendar", "日历", CalendarDays],
                  ].map(([mode, label, Icon]) => (
                    <button
                      key={mode as string}
                      type="button"
                      className={view === mode ? "is-active" : ""}
                      onClick={() => setView(mode as ViewMode)}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label as string}</span>
                    </button>
                  ))}
                </div>
              }
            >
              <div className="result-stack">
                <div className="metric-grid">
                  <MetricCard icon={<CircleDollarSign className="h-4 w-4" />} label="门店预计到卡" value={formatMoney(totalAmount)} />
                  <MetricCard icon={<WalletCards className="h-4 w-4" />} label="品牌抽佣合计" value={formatMoney(commissionTotal)} />
                  <MetricCard icon={<CalendarDays className="h-4 w-4" />} label="最早到卡" value={earliestArrival === "-" ? "-" : formatDate(earliestArrival)} />
                  <MetricCard icon={<ClipboardList className="h-4 w-4" />} label="明细数量" value={`${filteredDetails.length}`} />
                </div>

                <div className="filter-strip">
                  <Field label="到账开始">
                    <input
                      className="field-input"
                      type="date"
                      value={filters.start}
                      onChange={(event) => setFilters((current) => ({ ...current, start: event.target.value }))}
                    />
                  </Field>
                  <Field label="到账结束">
                    <input
                      className="field-input"
                      type="date"
                      value={filters.end}
                      onChange={(event) => setFilters((current) => ({ ...current, end: event.target.value }))}
                    />
                  </Field>
                  <button className="text-button" type="button" onClick={() => setFilters({ start: "", end: "" })}>
                    清空筛选
                  </button>
                </div>

                {isLoading ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                ) : selected.length === 0 || hasErrors || filteredDetails.length === 0 ? (
                  <EmptyState
                    title={hasErrors ? "先修正录入项" : selected.length === 0 ? "暂无核算结果" : "当前筛选没有结果"}
                    action={hasErrors ? "错误项已标记" : "结果会在这里出现"}
                  />
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={view}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                    >
                      {view === "board" && <BoardView details={filteredDetails} summary={summary} />}
                      {view === "list" && <ListView details={filteredDetails} summary={summary} />}
                      {view === "calendar" && <CalendarView details={filteredDetails} />}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </Panel>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="hero-focus summary-footer">
            <span className="hero-label">本次门店预计到卡</span>
            <strong>{formatMoney(totalAmount)}</strong>
            <span className="hero-subline">
              {filteredDetails.length > 0 ? `品牌抽佣 ${formatMoney(commissionTotal)} · 最早 ${formatDate(earliestArrival)}` : "选择平台后开始核算"}
            </span>
          </div>
        </section>
      </div>
      <FieldGuideDrawer open={fieldDrawerOpen} onClose={() => setFieldDrawerOpen(false)} />
    </main>
  );
}

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="glass-panel">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="panel-icon">{icon}</span>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-xs font-medium text-[hsl(var(--muted))]">{label}</span>
      {children}
      {error && <span className="text-xs font-medium text-rose-300">{error}</span>}
    </label>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        <span className="panel-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <p>{value}</p>
    </div>
  );
}

function StepIndicator({
  active,
  current,
  icon,
  index,
  meta,
  title,
  text,
}: {
  active: boolean;
  current: boolean;
  icon: ReactNode;
  index: number;
  meta: string;
  title: string;
  text: string;
}) {
  return (
    <aside className={`flow-step ${active ? "is-active" : ""}`} aria-label={`流程 ${index}: ${title}`}>
      <div className="flow-step-head">
        <span className="flow-index">
          <small>STEP</small>
          <strong>{String(index).padStart(2, "0")}</strong>
        </span>
        <span className="flow-text">
          <strong>{title}</strong>
          <small>{text}</small>
        </span>
      </div>
      <div className="flow-step-body" aria-hidden="true">
        <span className="flow-watermark">0{index}</span>
      </div>
      <div className="flow-step-foot">
        <span className="flow-state">
          <span className="flow-icon">{icon}</span>
          <span>{current ? "正在操作" : active ? "已完成" : "待处理"}</span>
        </span>
        <span className="flow-meta">{meta}</span>
      </div>
    </aside>
  );
}

function EmptyState({ title, action }: { title: string; action: string }) {
  return (
    <div className="empty-state">
      <EmptyIllustration />
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-[hsl(var(--muted))]">{action}</p>
    </div>
  );
}

function FieldGuideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [activeFieldId, setActiveFieldId] = useState(fieldDefinitions[0]?.id ?? "");
  const trackedOpenRef = useRef(false);
  const highRelevanceCount = fieldDefinitions.filter((field) => field.toolRelevance === "high").length;
  const financeCount = fieldDefinitions.filter((field) => field.category === "财务中心").length;
  const quickTerms = ["入账", "账期", "佣金", "余额", "实收", "到卡"];

  const filteredFields = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return fieldDefinitions
      .filter((field) => {
        const categoryMatched = category === "全部" || field.category === category || field.tags.includes(category);
        if (!categoryMatched) return false;
        if (!keyword) return true;
        const searchableText = [
          field.name,
          field.category,
          field.source,
          field.summary,
          field.formula,
          field.misread,
          field.example,
          field.toolUsage,
          field.tags.join(" "),
          field.drill?.join(" "),
          field.relatedFieldIds.map((id) => getFieldName(id)).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchableText.includes(keyword);
      })
      .sort((a, b) => relevanceRank(b) - relevanceRank(a));
  }, [category, query]);

  const activeField = useMemo(() => {
    return filteredFields.find((field) => field.id === activeFieldId) ?? filteredFields[0] ?? null;
  }, [activeFieldId, filteredFields]);

  useEffect(() => {
    if (filteredFields.length > 0 && !filteredFields.some((field) => field.id === activeFieldId)) {
      setActiveFieldId(filteredFields[0].id);
    }
  }, [activeFieldId, filteredFields]);

  useEffect(() => {
    if (!open) return;
    if (!trackedOpenRef.current) {
      trackEvent("field_drawer_opened", {
        total_fields: fieldDefinitions.length,
      });
      trackedOpenRef.current = true;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      trackedOpenRef.current = false;
      return;
    }
    const keyword = query.trim();
    if (!keyword) return;
    const timer = window.setTimeout(() => {
      trackEvent("field_search", {
        keyword,
        category,
        result_count: filteredFields.length,
      });
    }, 520);
    return () => window.clearTimeout(timer);
  }, [category, filteredFields.length, open, query]);

  function selectField(field: FieldDefinition) {
    setActiveFieldId(field.id);
    trackEvent("field_view", {
      field_id: field.id,
      field_name: field.name,
      category: field.category,
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="field-drawer-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="field-drawer-scrim" type="button" aria-label="关闭字段说明" onClick={onClose} />
          <motion.aside
            className="field-drawer"
            aria-label="数据中心字段说明"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
          >
            <header className="field-drawer-header">
              <div className="field-drawer-title">
                <span className="panel-icon">
                  <Database className="h-4 w-4" />
                </span>
                <div>
                  <p>数据中心字段说明</p>
                  <span>{fieldDefinitions.length} 个字段口径 · 支持全文查询</span>
                </div>
              </div>
              <div className="field-drawer-kpis" aria-label="字段统计">
                <span>
                  <strong>{fieldDefinitions.length}</strong>
                  全部字段
                </span>
                <span>
                  <strong>{highRelevanceCount}</strong>
                  核算强相关
                </span>
                <span>
                  <strong>{financeCount}</strong>
                  财务字段
                </span>
              </div>
              <button className="icon-button" type="button" aria-label="关闭字段说明" title="关闭" onClick={onClose}>
                <X className="h-4 w-4" />
              </button>
            </header>

            <section className="field-search-panel">
              <div className="field-search-row">
                <label className="field-search-box">
                  <Search className="h-4 w-4" />
                  <input
                    type="search"
                    value={query}
                    placeholder="搜索字段、口径、公式，例如：入账、T+1、佣金"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="field-quick-terms" aria-label="常用搜索">
                  {quickTerms.map((term) => (
                    <button key={term} type="button" onClick={() => setQuery(term)}>
                      {term}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-category-strip" aria-label="字段分类">
                {fieldCategories.map((item) => {
                  const count = countFieldsByCategory(item, query);
                  return (
                    <button key={item} type="button" className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>
                      <span>{item}</span>
                      <small>{count}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="field-drawer-body">
              <div className="field-list-pane">
                <div className="field-list-meta">
                  <span>
                    <ListFilter className="h-4 w-4" />
                    匹配 {filteredFields.length} 个字段
                  </span>
                  {query && <button type="button" onClick={() => setQuery("")}>清空</button>}
                </div>

                {filteredFields.length === 0 ? (
                  <FieldGuideEmpty />
                ) : (
                  <div className="field-list">
                    {filteredFields.map((field) => (
                      <motion.button
                        layout
                        key={field.id}
                        type="button"
                        className={`field-list-card ${activeField?.id === field.id ? "is-active" : ""}`}
                        onClick={() => selectField(field)}
                      >
                        <span className="field-list-card-head">
                          <strong>{field.name}</strong>
                          <small>{relevanceText(field.toolRelevance)}</small>
                        </span>
                        <span>{field.summary}</span>
                        <span className="field-tag-row">
                          <em>{field.category}</em>
                          {field.tags.slice(0, 2).map((tag) => (
                            <em key={tag}>{tag}</em>
                          ))}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>

              <div className="field-detail-pane">
                {activeField ? <FieldDetail field={activeField} onSelectRelated={(field) => selectField(field)} /> : <FieldGuideEmpty />}
              </div>
            </section>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FieldDetail({ field, onSelectRelated }: { field: FieldDefinition; onSelectRelated: (field: FieldDefinition) => void }) {
  const relatedFields = field.relatedFieldIds.map((id) => fieldDefinitions.find((item) => item.id === id)).filter(Boolean) as FieldDefinition[];

  return (
    <motion.article
      key={field.id}
      className="field-detail-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="field-detail-hero">
        <div>
          <span className="status-badge">{field.category}</span>
          <h3>{field.name}</h3>
          <p>{field.summary}</p>
          <div className="field-detail-tags">
            {field.tags.slice(0, 4).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        <span className="field-relevance">{relevanceText(field.toolRelevance)}</span>
      </div>

      <div className="field-detail-grid">
        <FieldDetailBlock title="数据来源" text={field.source} />
        <FieldDetailBlock title="计算公式 / 口径" text={field.formula} featured />
        <FieldDetailBlock title="常见误解" text={field.misread} accent />
        {field.example && <FieldDetailBlock title="示例" text={field.example} />}
      </div>

      {field.drill && field.drill.length > 0 && (
        <section className="field-detail-section">
          <h4>下钻建议</h4>
          <div className="field-drill-list">
            {field.drill.map((item) => (
              <span key={item}>
                <ArrowRight className="h-3.5 w-3.5" />
                {item}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="field-detail-section">
        <h4>相关字段</h4>
        <div className="field-related-list">
          {relatedFields.length > 0 ? (
            relatedFields.map((item) => (
              <button key={item.id} type="button" onClick={() => onSelectRelated(item)}>
                {item.name}
              </button>
            ))
          ) : (
            <span>暂无关联字段</span>
          )}
        </div>
      </section>
    </motion.article>
  );
}

function FieldDetailBlock({ title, text, accent = false, featured = false }: { title: string; text: string; accent?: boolean; featured?: boolean }) {
  return (
    <section className={`field-detail-block ${accent ? "is-accent" : ""} ${featured ? "is-featured" : ""}`}>
      <h4>{title}</h4>
      <p>{text}</p>
    </section>
  );
}

function FieldGuideEmpty() {
  return (
    <div className="field-guide-empty">
      <div className="field-empty-illustration" aria-hidden="true">
        <Loader2 className="h-8 w-8" />
      </div>
      <h3>没有匹配到字段</h3>
      <p>可以试试“入账”“佣金”“账期”“余额”“实收”。</p>
    </div>
  );
}

function countFieldsByCategory(category: string, query: string) {
  const keyword = query.trim().toLowerCase();
  return fieldDefinitions.filter((field) => {
    const categoryMatched = category === "全部" || field.category === category || field.tags.includes(category);
    if (!categoryMatched) return false;
    if (!keyword) return true;
    return [field.name, field.summary, field.formula, field.misread, field.tags.join(" ")].join(" ").toLowerCase().includes(keyword);
  }).length;
}

function relevanceRank(field: FieldDefinition) {
  if (field.toolRelevance === "high") return 3;
  if (field.toolRelevance === "medium") return 2;
  return 1;
}

function relevanceText(relevance: FieldDefinition["toolRelevance"]) {
  if (relevance === "high") return "强相关";
  if (relevance === "medium") return "可参考";
  return "扩展字段";
}

function getFieldName(id: string) {
  return fieldDefinitions.find((field) => field.id === id)?.name ?? id;
}

function BoardView({
  details,
  summary,
}: {
  details: DetailRow[];
  summary: { date: string; total: number; platforms: string[] }[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
      <div className="grid gap-3 xl:grid-cols-2">
        {details.map((item) => (
          <motion.article layout className="task-card p-4" key={item.platform.id}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`badge-gradient bg-gradient-to-br ${item.platform.accent}`}>{item.platform.badge}</span>
                <div className="min-w-0">
                  <h3 className="font-semibold">{item.platform.name}</h3>
                  <p className="text-xs text-[hsl(var(--muted))]">
                    {item.startDate} 至 {item.endDate}
                  </p>
                </div>
              </div>
              <span className="status-badge">T+{item.term}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InfoPill label="门店到卡" value={formatMoney(item.storeAmount)} />
              <InfoPill label="品牌抽佣" value={formatMoney(item.commission)} />
              <InfoPill label="到卡日期" value={formatDate(item.arrivalDate)} />
            </div>
          </motion.article>
        ))}
      </div>
      <div className="grid content-start gap-3">
        {summary.map((item) => (
          <article className="summary-row" key={item.date}>
            <div>
              <p className="text-sm font-semibold">{formatDate(item.date)}</p>
              <p className="text-xs text-[hsl(var(--muted))]">{item.platforms.join("、")}</p>
            </div>
            <strong>{formatMoney(item.total)}</strong>
          </article>
        ))}
      </div>
    </div>
  );
}

function ListView({
  details,
  summary,
}: {
  details: DetailRow[];
  summary: { date: string; total: number; platforms: string[] }[];
}) {
  return (
    <div className="grid gap-5">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>平台</th>
              <th>营收周期</th>
              <th>结算金额</th>
              <th>品牌抽佣</th>
              <th>门店到卡</th>
              <th>账期</th>
              <th>预计到卡</th>
            </tr>
          </thead>
          <tbody>
            {details.map((item) => (
              <tr key={item.platform.id}>
                <td>{item.platform.name}</td>
                <td>
                  {item.startDate} 至 {item.endDate}
                </td>
                <td>{formatMoney(item.amount)}</td>
                <td>{formatMoney(item.commission)}</td>
                <td>{formatMoney(item.storeAmount)}</td>
                <td>T+{item.term}</td>
                <td>{item.arrivalDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {summary.map((item) => (
          <article className="summary-row" key={item.date}>
            <div>
              <p className="text-sm font-semibold">{item.date}</p>
              <p className="text-xs text-[hsl(var(--muted))]">{item.platforms.join("、")}</p>
            </div>
            <strong>{formatMoney(item.total)}</strong>
          </article>
        ))}
      </div>
    </div>
  );
}

function CalendarView({ details }: { details: DetailRow[] }) {
  const days = useMemo(() => {
    const base = details[0]?.arrivalDate ?? isoToday;
    const date = new Date(`${base}T00:00:00`);
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const cells: Date[] = [];

    for (let i = 0; i < first.getDay(); i += 1) {
      cells.push(new Date(year, month, i - first.getDay() + 1));
    }
    for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day += 1) {
      cells.push(new Date(year, month, day));
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1];
      cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
    }

    return { month, cells };
  }, [details]);

  return (
    <div className="calendar-grid">
      {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
        <div className="calendar-head" key={day}>{day}</div>
      ))}
      {days.cells.map((date) => {
        const dateText = toDateInput(date);
        const dayItems = details.filter((item) => item.arrivalDate === dateText);
        const muted = date.getMonth() !== days.month;
        return (
          <div className={`calendar-cell ${muted ? "is-muted" : ""}`} key={dateText}>
            <span className="text-xs font-semibold">{date.getDate()}</span>
            <div className="mt-2 grid gap-1">
              {dayItems.map((item) => (
                <span className="calendar-chip" key={item.platform.id}>
                  {item.platform.name} {formatMoney(item.storeAmount)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3">
      <p className="text-xs text-[hsl(var(--muted))]">{label}</p>
      <p className="info-value">{value}</p>
    </div>
  );
}
