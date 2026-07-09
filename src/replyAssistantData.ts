export type ReplySource = "default" | "custom";

export type ReplyItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
  keywords: string[];
  scenario?: string;
  note?: string;
  source: ReplySource;
  createdAt?: string;
  updatedAt?: string;
};

export type ReplyDraft = Omit<ReplyItem, "id" | "source" | "createdAt" | "updatedAt">;

export const defaultReplyItems: ReplyItem[] = [
  {
    id: "default-arrival-date",
    question: "门店问这笔收入什么时候到卡",
    answer: "您好，这笔收入会按平台账期和门店结算周期核算到账时间。我们已根据账期口径核对，预计到账日期以系统核算结果为准，如银行入账存在延迟，会继续跟进确认。",
    category: "到账咨询",
    keywords: ["到账", "到卡", "账期", "T+N"],
    scenario: "门店询问收入到账时间",
    note: "适合配合核算工具结果一起发送。",
    source: "default",
  },
  {
    id: "default-amount-diff",
    question: "门店反馈到账金额和营收金额不一致",
    answer: "您好，到账金额与营收金额存在差异通常与平台抽佣、退款、优惠、配送费、平台补贴或账期拆分有关。我们会按订单明细和结算口径逐项核对，确认后同步差异原因。",
    category: "金额差异",
    keywords: ["金额不一致", "差异", "抽佣", "退款"],
    scenario: "解释到账金额和经营流水差异",
    source: "default",
  },
  {
    id: "default-field-meaning",
    question: "同事问字段口径是什么意思",
    answer: "这个字段需要结合数据中心口径理解，建议先确认它表示的是经营流水、入账金额还是最终到卡金额。不同字段的统计范围和账期归属不同，不能直接混用。",
    category: "字段口径",
    keywords: ["字段", "口径", "数据中心", "公式"],
    scenario: "解释字段含义或避免误用字段",
    source: "default",
  },
  {
    id: "default-bill-upload",
    question: "账单上传后需要拆分或打包",
    answer: "您好，请先上传平台原始账单文件，系统会按字段映射完成清洗和拆分。处理完成后可下载 Zip 包，里面包含汇总表、清洗日志和拆分后的账单文件。",
    category: "账单处理",
    keywords: ["上传", "账单", "拆分", "Zip"],
    scenario: "指导账单处理流程",
    source: "default",
  },
  {
    id: "default-checking-progress",
    question: "对方催促核对进度",
    answer: "您好，这边正在核对平台账单、门店流水和到账记录。涉及跨账期或金额差异的部分需要逐项确认，核对完成后会第一时间同步结果。",
    category: "进度反馈",
    keywords: ["进度", "催促", "核对", "对账"],
    scenario: "回复对账处理中",
    source: "default",
  },
  {
    id: "default-missing-data",
    question: "缺少必要账单或字段无法核对",
    answer: "您好，目前还缺少核对所需的账单或关键字段，暂时无法确认最终结果。请补充对应平台账单、门店信息或到账记录，我们收到后继续处理。",
    category: "资料补充",
    keywords: ["缺资料", "缺字段", "补充", "无法核对"],
    scenario: "需要对方补充资料",
    source: "default",
  },
];

export const emptyReplyDraft: ReplyDraft = {
  question: "",
  answer: "",
  category: "",
  keywords: [],
  scenario: "",
  note: "",
};
