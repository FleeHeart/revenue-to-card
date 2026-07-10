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
  MessageSquareText,
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
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "./analytics";
import { fieldDefinitions, type FieldDefinition } from "./fieldDefinitions";

type PlatformId = "wechat" | "alipay" | "meituanTakeout" | "taobaoFlash" | "jdInstant" | "douyinLocal" | "meituanGroup";
type ViewMode = "board" | "list" | "calendar";
type ThemeMode = "dark" | "light";
type AppRoute = "home" | "calculator" | "bill" | "fields" | "reply";

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

const fieldCategories = ["全部", "营业中心", "智慧门店", "财务中心", "轻量核算", "资金/到账", "服务费/佣金", "余额/提现", "订阅/台账", "对账/异常"];
const FIELD_PAGE_SIZE = 24;
const fieldSearchIndex = new Map(
  fieldDefinitions.map((field) => [
    field.id,
    [
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
      .toLowerCase(),
  ]),
);
const BillProcessorModal = lazy(() => import("./BillProcessorModal").then((module) => ({ default: module.BillProcessorModal })));
const ReplyAssistant = lazy(() => import("./ReplyAssistant").then((module) => ({ default: module.ReplyAssistant })));

const platforms: PlatformConfig[] = [
  {
    id: "wechat",
    name: "微信",
    defaultTerm: 1,
    termOptions: [1],
    badge: "WX",
    accent: "from-emerald-200 via-lime-300 to-teal-300",
  },
  {
    id: "alipay",
    name: "支付宝",
    defaultTerm: 1,
    termOptions: [1],
    badge: "ALI",
    accent: "from-sky-200 via-teal-300 to-lime-300",
  },
  {
    id: "meituanTakeout",
    name: "美团外卖",
    defaultTerm: 3,
    termOptions: [3],
    badge: "MT",
    accent: "from-yellow-200 via-amber-300 to-lime-300",
  },
  {
    id: "taobaoFlash",
    name: "淘宝闪购",
    defaultTerm: 3,
    termOptions: [3],
    badge: "TB",
    accent: "from-orange-300 via-rose-300 to-amber-200",
  },
  {
    id: "jdInstant",
    name: "京东秒送",
    defaultTerm: 1,
    termOptions: [1, 3],
    badge: "JD",
    accent: "from-rose-300 via-orange-300 to-yellow-200",
  },
  {
    id: "douyinLocal",
    name: "抖音来客",
    defaultTerm: 5,
    termOptions: [5],
    badge: "DY",
    accent: "from-neutral-100 via-teal-300 to-rose-300",
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

function getRouteFromPath(pathname: string): AppRoute {
  if (pathname.endsWith("/calculator")) return "calculator";
  if (pathname.endsWith("/bill")) return "bill";
  if (pathname.endsWith("/fields")) return "fields";
  if (pathname.endsWith("/reply")) return "reply";
  return "home";
}

function getPathForRoute(route: AppRoute) {
  if (route === "home") return "/";
  return `/${route}`;
}

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
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromPath(window.location.pathname));
  const trackedCalculationKey = useRef("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const onPopState = () => setRoute(getRouteFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    trackEvent("page_view", { page: route });
  }, [route]);

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

  function navigate(route: AppRoute) {
    const nextPath = getPathForRoute(route);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setRoute(route);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[hsl(var(--bg))] text-[hsl(var(--text))]">
      <div className="workspace-shell">
        <AppTopBar
          route={route}
          theme={theme}
          today={isoToday}
          onNavigate={navigate}
          onReset={resetAll}
          onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        />

        {route === "home" && <HomePortal today={isoToday} onNavigate={navigate} />}

        {route === "calculator" && <section className="process-grid mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
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
                        key={id}
                        className="entry-card task-card"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
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
                <div className="result-brief">
                  <div>
                    <span className="hero-label">Settlement Timeline</span>
                    <h2>到卡节奏看板</h2>
                  </div>
                  <p>{filteredDetails.length > 0 ? "已按平台账期汇总门店预计到账。" : "录入平台金额后，这里会生成明细、汇总和日历视图。"}</p>
                </div>

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

                {selected.length === 0 || hasErrors || filteredDetails.length === 0 ? (
                  <EmptyState
                    title={hasErrors ? "先修正录入项" : selected.length === 0 ? "暂无核算结果" : "当前筛选没有结果"}
                    action={hasErrors ? "错误项已标记" : "结果会在这里出现"}
                    hint={selected.length === 0 ? "先选平台并录入金额" : "调整录入项或筛选条件后刷新视图"}
                  />
                ) : (
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={view}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
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
        </section>}

        {route === "calculator" && <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="hero-focus summary-footer">
            <span className="hero-label">本次门店预计到卡</span>
            <strong>{formatMoney(totalAmount)}</strong>
            <span className="hero-subline">
              {filteredDetails.length > 0 ? `品牌抽佣 ${formatMoney(commissionTotal)} · 最早 ${formatDate(earliestArrival)}` : "选择平台后开始核算"}
            </span>
          </div>
        </section>}
        {route === "fields" && <FieldGuideDrawer open onClose={() => navigate("home")} />}
        {route === "bill" && (
          <Suspense fallback={<FeaturePageSkeleton />}>
            <BillProcessorModal open onClose={() => navigate("home")} />
          </Suspense>
        )}
        <Suspense fallback={<FeaturePageSkeleton />}>
          {route === "reply" && <ReplyAssistant onClose={() => navigate("home")} />}
        </Suspense>
      </div>
    </main>
  );
}

function FeaturePageSkeleton() {
  return (
    <section className="feature-page-skeleton" aria-label="正在加载">
      <SkeletonCard />
      <SkeletonCard />
    </section>
  );
}

function AppTopBar({
  route,
  theme,
  today,
  onNavigate,
  onReset,
  onToggleTheme,
}: {
  route: AppRoute;
  theme: ThemeMode;
  today: string;
  onNavigate: (route: AppRoute) => void;
  onReset: () => void;
  onToggleTheme: () => void;
}) {
  const navItems: Array<{ route: AppRoute; label: string; icon: ReactNode }> = [
    { route: "home", label: "首页", icon: <Sparkles className="h-4 w-4" /> },
    { route: "calculator", label: "核算工具", icon: <WalletCards className="h-4 w-4" /> },
    { route: "bill", label: "账单处理", icon: <Database className="h-4 w-4" /> },
    { route: "fields", label: "字段说明", icon: <BookOpen className="h-4 w-4" /> },
    { route: "reply", label: "回复助手", icon: <MessageSquareText className="h-4 w-4" /> },
  ];

  return (
    <header className="app-topbar">
      <button className="brand-lockup" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark">
          <Sparkles className="h-4 w-4" />
        </span>
        <span>
          <strong>扶摇</strong>
          <small>FuYao · {today}</small>
        </span>
      </button>

      <nav className="app-nav" aria-label="主要功能">
        {navItems.map((item) => (
          <button
            key={item.route}
            className={route === item.route ? "is-active" : ""}
            type="button"
            onClick={() => onNavigate(item.route)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="topbar-actions">
        {route === "calculator" && (
          <button className="icon-button" type="button" aria-label="重置" title="重置" onClick={onReset}>
            <RefreshCcw className="h-4 w-4" />
          </button>
        )}
        <button className="icon-button" type="button" aria-label="切换主题" title="切换主题" onClick={onToggleTheme}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}

function HomePortal({ today, onNavigate }: { today: string; onNavigate: (route: AppRoute) => void }) {
  const features: Array<{
    route: AppRoute;
    title: string;
    text: string;
    meta: string;
    stat: string;
    foot: string;
    icon: ReactNode;
    accent: string;
  }> = [
    {
      route: "calculator",
      title: "核算工具",
      text: "按平台账期、抽佣比例和营收周期，生成门店预计到卡日期、明细与汇总视图。",
      meta: "T+N 到卡测算",
      stat: "7 平台",
      foot: "到账节奏、佣金扣减、日历视图",
      icon: <WalletCards className="h-5 w-5" />,
      accent: "from-lime-200 via-emerald-300 to-teal-300",
    },
    {
      route: "bill",
      title: "账单处理",
      text: "上传京东秒送账单，完成字段识别、清洗映射、拆分账单和 Zip 打包下载。",
      meta: "本地解析账单",
      stat: "XLSX",
      foot: "模板映射、清洗日志、打包下载",
      icon: <Database className="h-5 w-5" />,
      accent: "from-teal-200 via-lime-300 to-amber-200",
    },
    {
      route: "fields",
      title: "字段说明",
      text: "查询数据中心字段口径、公式、常见误解和关联字段，减少对账沟通成本。",
      meta: `${fieldDefinitions.length} 个字段口径`,
      stat: "口径库",
      foot: "字段搜索、公式解释、关联跳转",
      icon: <BookOpen className="h-5 w-5" />,
      accent: "from-amber-200 via-orange-300 to-rose-300",
    },
    {
      route: "reply",
      title: "回复助手",
      text: "维护常用 Q/A 和标准话术，按问题、关键词、场景快速筛选，并一键复制回复内容。",
      meta: "Q/A 话术库",
      stat: "复制",
      foot: "上传导入、增删改查、全量检索",
      icon: <MessageSquareText className="h-5 w-5" />,
      accent: "from-cyan-200 via-lime-300 to-emerald-300",
    },
  ];

  return (
    <section className="home-portal mx-auto w-full max-w-7xl px-4 pb-8 pt-2 sm:px-6 lg:px-8">
      <motion.div className="home-hero" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.14 }}>
        <div className="home-copy">
          <span className="system-chip">
            <Sparkles className="h-3.5 w-3.5" />
            FuYao · {today}
          </span>
          <h1>扶摇</h1>
          <p>把平台账单、到账测算、字段口径和标准回复集中到一个入口。少解释几轮，多给一份能直接对账和沟通的结果。</p>
          <div className="hero-action-row">
            <button className="primary-hero-action" type="button" onClick={() => onNavigate("calculator")}>
              <WalletCards className="h-4 w-4" />
              开始核算
            </button>
            <button className="secondary-hero-action" type="button" onClick={() => onNavigate("bill")}>
              处理账单
            </button>
          </div>
        </div>
        <div className="home-console" aria-label="系统基础能力">
          <div className="console-header">
            <span>LIVE WORKFLOW</span>
            <strong>4</strong>
          </div>
          <div className="console-track">
            <span>账单</span>
            <span>清洗</span>
            <span>核算</span>
            <span>回复</span>
          </div>
          <div className="system-capabilities">
            <span>
              <small>01</small>
              平台账期统一换算
            </span>
            <span>
              <small>02</small>
              账单清洗与拆分
            </span>
            <span>
              <small>03</small>
              字段口径快速检索
            </span>
            <span>
              <small>04</small>
              回复话术一键复制
            </span>
          </div>
        </div>
      </motion.div>

      <div className="feature-entry-grid">
        {features.map((feature) => (
          <motion.button
            key={feature.route}
            className={`feature-entry-card task-card is-${feature.route}`}
            type="button"
            onClick={() => onNavigate(feature.route)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12 }}
          >
            <span className={`feature-entry-icon bg-gradient-to-br ${feature.accent}`}>{feature.icon}</span>
            <span className="feature-entry-copy">
              <small>{feature.meta}</small>
              <strong>{feature.title}</strong>
              <span>{feature.text}</span>
            </span>
            <span className="feature-entry-stat">{feature.stat}</span>
            <span className="feature-entry-foot">{feature.foot}</span>
            <ArrowRight className="feature-entry-arrow h-5 w-5" />
          </motion.button>
        ))}
      </div>

      <div className="home-support-grid">
        <section>
          <h2>适合处理什么问题</h2>
          <p>当品牌、门店或财务同事问“这笔收入什么时候到卡、金额为什么不一致、字段口径怎么算”时，可以从这里直接进入对应工具。</p>
        </section>
        <section>
          <h2>使用方式</h2>
          <p>选择功能入口后进入全屏工作区；浏览器地址会同步为独立路径，方便刷新、收藏或直接分享给同事。</p>
        </section>
      </div>
    </section>
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

function EmptyState({ title, action, hint = "选择平台后，这里会自动展开录入卡片" }: { title: string; action: string; hint?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-mark" aria-hidden="true">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="empty-state-copy">
        <h3>{title}</h3>
        <p>{action}</p>
      </div>
      <span className="empty-state-hint">{hint}</span>
    </div>
  );
}

function FieldGuideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [activeFieldId, setActiveFieldId] = useState(fieldDefinitions[0]?.id ?? "");
  const [visibleLimit, setVisibleLimit] = useState(FIELD_PAGE_SIZE);
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
        return (fieldSearchIndex.get(field.id) ?? "").includes(keyword);
      })
      .sort((a, b) => relevanceRank(b) - relevanceRank(a));
  }, [category, query]);

  const activeField = useMemo(() => {
    return filteredFields.find((field) => field.id === activeFieldId) ?? filteredFields[0] ?? null;
  }, [activeFieldId, filteredFields]);
  const visibleFields = filteredFields.slice(0, visibleLimit);
  const hasMoreFields = visibleLimit < filteredFields.length;

  useEffect(() => {
    if (filteredFields.length > 0 && !filteredFields.some((field) => field.id === activeFieldId)) {
      setActiveFieldId(filteredFields[0].id);
    }
  }, [activeFieldId, filteredFields]);

  useEffect(() => {
    setVisibleLimit(FIELD_PAGE_SIZE);
  }, [category, query]);

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
    <AnimatePresence initial={false}>
      {open && (
        <motion.div className="field-drawer-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
          <button className="field-drawer-scrim" type="button" aria-label="关闭字段说明" onClick={onClose} />
          <aside
            className="field-drawer"
            aria-label="数据中心字段说明"
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
                    {visibleFields.map((field) => (
                      <button
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
                      </button>
                    ))}
                    {hasMoreFields && (
                      <button className="field-load-more" type="button" onClick={() => setVisibleLimit((current) => current + FIELD_PAGE_SIZE)}>
                        加载更多
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="field-detail-pane">
                {activeField ? <FieldDetail field={activeField} onSelectRelated={(field) => selectField(field)} /> : <FieldGuideEmpty />}
              </div>
            </section>
          </aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FieldDetail({ field, onSelectRelated }: { field: FieldDefinition; onSelectRelated: (field: FieldDefinition) => void }) {
  const relatedFields = field.relatedFieldIds.map((id) => fieldDefinitions.find((item) => item.id === id)).filter(Boolean) as FieldDefinition[];

  return (
    <article
      key={field.id}
      className="field-detail-card"
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
    </article>
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
          <article className="task-card p-4" key={item.platform.id}>
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
          </article>
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
