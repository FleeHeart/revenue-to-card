import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Clipboard,
  Copy,
  FileUp,
  ListFilter,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { defaultReplyItems, emptyReplyDraft, type ReplyDraft, type ReplyItem, type ReplySource } from "./replyAssistantData";

const REPLY_PAGE_SIZE = 80;

const COLUMN_ALIASES = {
  question: ["问题", "提问", "问法", "Q", "q", "question", "Question"],
  answer: ["回复", "答案", "话术", "A", "a", "answer", "Answer"],
  category: ["分类", "类别", "category", "Category"],
  keywords: ["关键词", "关键字", "标签", "keywords", "keyword", "tags", "Tags"],
  scenario: ["适用场景", "场景", "使用场景", "scenario", "Scenario"],
  note: ["备注", "说明", "note", "Note"],
} as const;

type SourceFilter = "all" | ReplySource;
type EditMode = "create" | "edit";

export function ReplyAssistant({ onClose }: { onClose: () => void }) {
  const [customItems, setCustomItems] = useState<ReplyItem[]>(defaultReplyItems);
  const [isLoadingReplies, setIsLoadingReplies] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [keyword, setKeyword] = useState("全部");
  const [source, setSource] = useState<SourceFilter>("all");
  const [activeId, setActiveId] = useState(defaultReplyItems[0]?.id ?? "");
  const [editor, setEditor] = useState<{ mode: EditMode; item?: ReplyItem } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReplyItem | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [dataMessage, setDataMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(REPLY_PAGE_SIZE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const allItems = customItems;
  const deferredQuery = useDeferredValue(query);
  const categories = useMemo(() => ["全部", ...unique(allItems.map((item) => item.category).filter(Boolean))], [allItems]);
  const keywords = useMemo(() => ["全部", ...unique(allItems.flatMap((item) => item.keywords).filter(Boolean))], [allItems]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalize(deferredQuery);
    return allItems.filter((item) => {
      if (source !== "all" && item.source !== source) return false;
      if (category !== "全部" && item.category !== category) return false;
      if (keyword !== "全部" && !item.keywords.includes(keyword)) return false;
      if (!normalizedQuery) return true;
      return normalize(buildSearchText(item)).includes(normalizedQuery);
    });
  }, [allItems, category, deferredQuery, keyword, source]);

  const activeItem = filteredItems.find((item) => item.id === activeId) ?? filteredItems[0] ?? allItems[0];
  const customCount = customItems.filter((item) => item.source === "custom").length;
  const visibleItems = filteredItems.slice(0, visibleLimit);
  const hasMoreItems = visibleLimit < filteredItems.length;

  useEffect(() => {
    let cancelled = false;
    async function loadReplies() {
      setIsLoadingReplies(true);
      try {
        const replies = await fetchReplyItems();
        if (cancelled) return;
        setCustomItems(replies.length > 0 ? replies : defaultReplyItems);
        setActiveId(replies[0]?.id ?? defaultReplyItems[0]?.id ?? "");
        setDataMessage("");
      } catch (error) {
        if (cancelled) return;
        setCustomItems(defaultReplyItems);
        setActiveId(defaultReplyItems[0]?.id ?? "");
        setDataMessage(error instanceof Error ? error.message : "线上回复库暂时不可用，当前显示默认兜底库");
      } finally {
        if (!cancelled) setIsLoadingReplies(false);
      }
    }
    void loadReplies();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeItem) setActiveId(activeItem.id);
  }, [activeItem?.id]);

  useEffect(() => {
    setVisibleLimit(REPLY_PAGE_SIZE);
  }, [category, deferredQuery, keyword, source]);

  async function saveDraft(draft: ReplyDraft, password: string, original?: ReplyItem) {
    const payload = {
      ...draft,
      keywords: normalizeKeywords(draft.keywords),
      source: original?.source ?? ("custom" as const),
    };
    const saved = original ? await updateReplyItem(original.id, payload, password) : await createReplyItem(payload, password);
    setCustomItems((current) => {
      if (original) {
        return current.map((item) => (item.id === original.id ? saved : item));
      }
      return [saved, ...current];
    });
    setActiveId(saved.id);
    setEditor(null);
  }

  async function deleteItem(item: ReplyItem, password: string) {
    await deleteReplyItem(item.id, password);
    setCustomItems((current) => current.filter((entry) => entry.id !== item.id));
    setActiveId(defaultReplyItems[0]?.id ?? "");
  }

  async function copyAnswer(item: ReplyItem) {
    await copyText(item.answer);
    setCopyMessage("已复制回复");
    window.setTimeout(() => setCopyMessage(""), 1600);
  }

  async function handleUpload(file?: File) {
    if (!file) return;
    setUploadMessage("");
    const password = window.prompt("请输入操作密码");
    if (!password) {
      setUploadMessage("已取消导入");
      return;
    }
    try {
      const imported = file.name.toLowerCase().endsWith(".csv") ? await parseCsvFile(file) : await parseWorkbookFile(file);
      if (imported.length === 0) {
        setUploadMessage("没有识别到可导入的回复数据");
        return;
      }
      const saved = await createReplyItems(imported.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...item }) => item), password);
      setCustomItems((current) => [...saved, ...current]);
      setActiveId(saved[0]?.id ?? imported[0].id);
      setUploadMessage(`已导入 ${saved.length} 条回复`);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "导入失败，请检查文件格式");
    }
  }

  return (
    <motion.section className="reply-assistant-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
      <header className="reply-page-header">
        <div className="reply-page-title">
          <span className="panel-icon">
            <MessageSquareText className="h-4 w-4" />
          </span>
          <div>
            <p>回复助手</p>
            <span>默认库 + 我的回复库 · 全量信息检索 · 一键复制回复</span>
          </div>
        </div>
        <div className="reply-header-actions">
          <button className="reply-primary-button" type="button" onClick={() => setEditor({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            新增回复
          </button>
          <button className="icon-button" type="button" aria-label="返回首页" title="返回首页" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {(dataMessage || isLoadingReplies) && (
        <div className="reply-data-message">
          {isLoadingReplies ? "正在同步线上回复库..." : dataMessage}
        </div>
      )}

      <section className="reply-toolbar">
        <label className="reply-search">
          <Search className="h-4 w-4" />
          <input value={query} placeholder="搜索问题、回复、关键词、场景、备注" type="search" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="reply-filter-row">
          <select value={source} onChange={(event) => setSource(event.target.value as SourceFilter)}>
            <option value="all">全部来源</option>
            <option value="default">默认库</option>
            <option value="custom">我的库</option>
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={keyword} onChange={(event) => setKeyword(event.target.value)}>
            {keywords.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="reply-body">
        <aside className="reply-side-panel">
          <div className="reply-upload-card">
            <input
              ref={fileInputRef}
              accept=".xlsx,.csv"
              className="sr-only"
              type="file"
              onChange={(event) => void handleUpload(event.target.files?.[0])}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="h-5 w-5" />
              <span>
                <strong>上传 Q/A 文件</strong>
                <small>支持问题、回复、分类、关键词、场景、备注</small>
              </span>
            </button>
            {uploadMessage && <p>{uploadMessage}</p>}
          </div>

          <div className="reply-stat-grid">
            <span>
              <strong>{allItems.length}</strong>
              全部回复
            </span>
            <span>
              <strong>{customCount}</strong>
              我的库
            </span>
            <span>
              <strong>{filteredItems.length}</strong>
              当前匹配
            </span>
          </div>

          <div className="reply-list-meta">
            <span>
              <ListFilter className="h-4 w-4" />
              匹配结果
            </span>
            {(query || category !== "全部" || keyword !== "全部" || source !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("全部");
                  setKeyword("全部");
                  setSource("all");
                }}
              >
                清空
              </button>
            )}
          </div>

          <div className="reply-list">
            {filteredItems.length === 0 ? (
              <div className="reply-empty">
                <Sparkles className="h-5 w-5" />
                <strong>没有匹配回复</strong>
                <span>换个关键词，或新增一条常用回复。</span>
              </div>
            ) : (
              visibleItems.map((item) => (
                <button key={item.id} className={`reply-list-card ${activeItem?.id === item.id ? "is-active" : ""}`} type="button" onClick={() => setActiveId(item.id)}>
                  <span className="reply-list-card-head">
                    <strong>{item.question}</strong>
                    <small>{item.source === "default" ? "默认" : "我的"}</small>
                  </span>
                  <span>{item.answer}</span>
                  <em>{item.category || "未分类"}</em>
                </button>
              ))
            )}
            {hasMoreItems && (
              <button className="reply-load-more" type="button" onClick={() => setVisibleLimit((current) => current + REPLY_PAGE_SIZE)}>
                加载更多
              </button>
            )}
          </div>
        </aside>

        <section className="reply-detail-panel">
          {activeItem ? (
            <ReplyDetail
              item={activeItem}
              copyMessage={copyMessage}
              onCopy={() => void copyAnswer(activeItem)}
              onEdit={() => setEditor({ mode: "edit", item: activeItem })}
              onDelete={() => setDeleteTarget(activeItem)}
            />
          ) : (
            <div className="reply-empty is-large">
              <Sparkles className="h-6 w-6" />
              <strong>先新增或上传回复</strong>
              <span>这里会展示可复制的回复内容。</span>
            </div>
          )}
        </section>
      </section>

      <AnimatePresence>
        {editor && (
          <ReplyEditor
            key={editor.item?.id ?? "new"}
            mode={editor.mode}
            item={editor.item}
            onCancel={() => setEditor(null)}
            onSave={async (draft, password) => {
              await saveDraft(draft, password, editor.item);
              setDataMessage("已保存到线上回复库");
              window.setTimeout(() => setDataMessage(""), 1800);
            }}
          />
        )}
        {deleteTarget && (
          <DeleteConfirm
            key={deleteTarget.id}
            item={deleteTarget}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={async (password) => {
              await deleteItem(deleteTarget, password);
              setDeleteTarget(null);
            }}
          />
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function ReplyDetail({
  item,
  copyMessage,
  onCopy,
  onEdit,
  onDelete,
}: {
  item: ReplyItem;
  copyMessage: string;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="reply-detail-stack">
      <div className="reply-detail-hero">
        <div>
          <span>{item.source === "default" ? "默认回复" : "我的回复"}</span>
          <h2>{item.question}</h2>
        </div>
        <div className="reply-detail-actions">
          <button className="reply-primary-button" type="button" onClick={onCopy}>
            {copyMessage ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copyMessage || "复制回复"}
          </button>
          <button className="text-button" type="button" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            编辑
          </button>
          <button className="text-button" type="button" title="删除回复" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        </div>
      </div>

      <section className="reply-answer-card">
        <div>
          <Clipboard className="h-4 w-4" />
          <span>复制时仅复制以下回复内容</span>
        </div>
        <p>{item.answer}</p>
      </section>

      <div className="reply-info-grid">
        <ReplyInfo label="分类" value={item.category || "未分类"} />
        <ReplyInfo label="适用场景" value={item.scenario || "未填写"} />
        <ReplyInfo label="备注" value={item.note || "未填写"} />
      </div>

      <div className="reply-keyword-panel">
        <span>
          <Tag className="h-4 w-4" />
          关键词
        </span>
        <div>
          {item.keywords.length > 0 ? item.keywords.map((entry) => <em key={entry}>{entry}</em>) : <em>未填写</em>}
        </div>
      </div>
    </div>
  );
}

function ReplyInfo({ label, value }: { label: string; value: string }) {
  return (
    <section>
      <span>{label}</span>
      <p>{value}</p>
    </section>
  );
}

function DeleteConfirm({
  item,
  onCancel,
  onConfirm,
}: {
  item: ReplyItem;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      await onConfirm(password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.div className="reply-editor-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="reply-editor-scrim" type="button" aria-label="取消删除" onClick={onCancel} />
      <motion.form
        className="reply-editor reply-delete-confirm"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18 }}
        onSubmit={submit}
      >
        <header>
          <div>
            <strong>确认删除回复</strong>
            <span>删除后会从我的回复库移除，本地不可恢复。</span>
          </div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onCancel}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <section className="reply-delete-target">
          <span>将删除</span>
          <p>{item.question}</p>
        </section>
        <label>
          删除密码
          <input
            autoFocus
            className="field-input"
            type="password"
            value={password}
            placeholder="请输入删除密码"
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }}
          />
        </label>
        {error && <p className="reply-delete-error">{error}</p>}
        <footer>
          <button className="text-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="reply-danger-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "正在删除" : "确认删除"}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

function ReplyEditor({
  mode,
  item,
  onCancel,
  onSave,
}: {
  mode: EditMode;
  item?: ReplyItem;
  onCancel: () => void;
  onSave: (draft: ReplyDraft, password: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<ReplyDraft>(() => ({
    ...emptyReplyDraft,
    ...item,
    keywords: item?.keywords ?? [],
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  const canSave = draft.question.trim() && draft.answer.trim() && password.trim();

  function update<K extends keyof ReplyDraft>(key: K, value: ReplyDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <motion.div className="reply-editor-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="reply-editor-scrim" type="button" aria-label="关闭编辑" onClick={onCancel} />
      <motion.form
        className="reply-editor"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18 }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canSave || isSaving) return;
          setIsSaving(true);
          setError("");
          try {
            await onSave(draft, password);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "保存回复失败");
          } finally {
            setIsSaving(false);
          }
        }}
      >
        <header>
          <div>
            <strong>{mode === "create" ? "新增回复" : "编辑回复"}</strong>
            <span>保存需要操作密码</span>
          </div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onCancel}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <label>
          问题
          <input className="field-input" value={draft.question} onChange={(event) => update("question", event.target.value)} />
        </label>
        <label>
          回复
          <textarea className="field-input" rows={5} value={draft.answer} onChange={(event) => update("answer", event.target.value)} />
        </label>
        <div className="reply-editor-grid">
          <label>
            分类
            <input className="field-input" value={draft.category} onChange={(event) => update("category", event.target.value)} />
          </label>
          <label>
            关键词
            <input className="field-input" value={draft.keywords.join("，")} onChange={(event) => update("keywords", splitKeywords(event.target.value))} />
          </label>
        </div>
        <label>
          适用场景
          <input className="field-input" value={draft.scenario ?? ""} onChange={(event) => update("scenario", event.target.value)} />
        </label>
        <label>
          备注
          <textarea className="field-input" rows={3} value={draft.note ?? ""} onChange={(event) => update("note", event.target.value)} />
        </label>
        <label>
          操作密码
          <input
            className="field-input"
            type="password"
            value={password}
            placeholder="请输入操作密码"
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }}
          />
        </label>
        {error && <p className="reply-editor-error">{error}</p>}
        <footer>
          <button className="text-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="reply-primary-button" type="submit" disabled={!canSave || isSaving}>
            {isSaving ? "正在保存" : "保存到线上库"}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

async function fetchReplyItems() {
  const response = await fetch("/api/replies");
  if (!response.ok) throw new Error(await apiError(response, "线上回复库暂时不可用，当前显示默认兜底库"));
  const rows = ((await response.json().catch(() => [])) as unknown[]);
  return rows.map(mapApiReply).filter((item) => item.question && item.answer);
}

async function createReplyItem(draft: ReplyDraft & { source: ReplySource }, password: string) {
  const [item] = await createReplyItems([draft], password);
  if (!item) throw new Error("保存回复失败");
  return item;
}

async function createReplyItems(items: Array<ReplyDraft & { source: ReplySource }>, password: string) {
  const response = await fetch("/api/replies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, password }),
  });
  if (!response.ok) throw new Error(await apiError(response, "保存回复失败"));
  const rows = (await response.json()) as unknown[];
  return rows.map(mapApiReply);
}

async function updateReplyItem(id: string, draft: ReplyDraft & { source: ReplySource }, password: string) {
  const response = await fetch("/api/replies", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...draft, password }),
  });
  if (!response.ok) throw new Error(await apiError(response, "更新回复失败"));
  const rows = (await response.json()) as unknown[];
  const [item] = rows.map(mapApiReply);
  if (!item) throw new Error("更新回复失败");
  return item;
}

async function deleteReplyItem(id: string, password: string) {
  const response = await fetch("/api/replies", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, password }),
  });
  if (!response.ok) throw new Error(await apiError(response, response.status === 403 ? "密码不正确" : "删除回复失败"));
}

async function apiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string; detail?: string };
    return body.error === "Invalid delete password" || body.error === "Invalid reply password" ? "密码不正确" : body.detail || body.error || fallback;
  } catch {
    return fallback;
  }
}

function mapApiReply(row: unknown): ReplyItem {
  const item = row as Record<string, unknown>;
  return {
    id: textValue(item.id),
    question: textValue(item.question),
    answer: textValue(item.answer),
    category: textValue(item.category),
    keywords: Array.isArray(item.keywords) ? item.keywords.map(textValue).filter(Boolean) : [],
    scenario: textValue(item.scenario),
    note: textValue(item.note),
    source: item.source === "default" ? "default" : "custom",
    createdAt: textValue(item.created_at ?? item.createdAt),
    updatedAt: textValue(item.updated_at ?? item.updatedAt),
  };
}

async function parseWorkbookFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("请上传 .xlsx 或 .csv 文件");
  }
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("文件中没有可读取的工作表");
  const rows: string[][] = [];
  worksheet.eachRow((row) => rows.push(rowToStrings(row.values)));
  return rowsToReplyItems(rows);
}

async function parseCsvFile(file: File) {
  const text = await file.text();
  return rowsToReplyItems(parseCsv(text));
}

function rowsToReplyItems(rows: string[][]) {
  const [headers = [], ...body] = rows.filter((row) => row.some((cell) => cell.trim()));
  const headerMap = buildHeaderIndexes(headers);
  if (headerMap.question === -1 || headerMap.answer === -1) {
    throw new Error("文件至少需要包含“问题”和“回复”两列");
  }
  const now = new Date().toISOString();
  return body
    .map((row, index): ReplyItem | null => {
      const question = cell(row, headerMap.question);
      const answer = cell(row, headerMap.answer);
      if (!question || !answer) return null;
      return {
        id: `custom-import-${Date.now()}-${index}`,
        question,
        answer,
        category: cell(row, headerMap.category),
        keywords: splitKeywords(cell(row, headerMap.keywords)),
        scenario: cell(row, headerMap.scenario),
        note: cell(row, headerMap.note),
        source: "custom",
        createdAt: now,
        updatedAt: now,
      };
    })
    .filter(Boolean) as ReplyItem[];
}

function buildHeaderIndexes(headers: string[]) {
  return {
    question: findHeader(headers, COLUMN_ALIASES.question),
    answer: findHeader(headers, COLUMN_ALIASES.answer),
    category: findHeader(headers, COLUMN_ALIASES.category),
    keywords: findHeader(headers, COLUMN_ALIASES.keywords),
    scenario: findHeader(headers, COLUMN_ALIASES.scenario),
    note: findHeader(headers, COLUMN_ALIASES.note),
  };
}

function findHeader(headers: string[], aliases: readonly string[]) {
  const normalizedAliases = aliases.map(normalize);
  return headers.findIndex((header) => normalizedAliases.includes(normalize(header)));
}

function rowToStrings(values: unknown) {
  return Array.isArray(values) ? values.slice(1).map(textValue) : [];
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cellValue += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cellValue.trim());
      cellValue = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cellValue.trim());
      rows.push(row);
      row = [];
      cellValue = "";
    } else {
      cellValue += char;
    }
  }
  row.push(cellValue.trim());
  rows.push(row);
  return rows;
}

function cell(row: string[], index: number) {
  return index >= 0 ? textValue(row[index]) : "";
}

function textValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String((value as { text?: unknown }).text ?? "").trim();
  if (typeof value === "object" && "result" in value) return String((value as { result?: unknown }).result ?? "").trim();
  return String(value).trim();
}

function splitKeywords(value: string) {
  return value
    .split(/[,，;；、/|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeKeywords(values: string[]) {
  return unique(values.map((item) => item.trim()).filter(Boolean));
}

function buildSearchText(item: ReplyItem) {
  return [item.question, item.answer, item.category, item.scenario, item.note, ...item.keywords].join(" ");
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
