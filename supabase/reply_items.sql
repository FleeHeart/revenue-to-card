create table if not exists public.reply_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default '',
  keywords text[] not null default '{}'::text[],
  scenario text not null default '',
  note text not null default '',
  source text not null default 'custom' check (source in ('default', 'custom')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reply_items_active_updated_idx
on public.reply_items (is_active, updated_at desc);

create index if not exists reply_items_source_idx
on public.reply_items (source);

create index if not exists reply_items_keywords_idx
on public.reply_items using gin (keywords);

create unique index if not exists reply_items_active_source_question_uidx
on public.reply_items (source, question)
where is_active = true;

create or replace function public.set_reply_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_reply_items_updated_at on public.reply_items;

create trigger set_reply_items_updated_at
before update on public.reply_items
for each row
execute function public.set_reply_items_updated_at();

alter table public.reply_items enable row level security;

grant usage on schema public to anon;
grant select on public.reply_items to anon;

drop policy if exists "Allow anonymous reply reads" on public.reply_items;

create policy "Allow anonymous reply reads"
on public.reply_items
for select
to anon
using (is_active = true);

insert into public.reply_items (question, answer, category, keywords, scenario, note, source)
values
  (
    '门店问这笔收入什么时候到卡',
    '您好，这笔收入会按平台账期和门店结算周期核算到账时间。我们已根据账期口径核对，预计到账日期以系统核算结果为准，如银行入账存在延迟，会继续跟进确认。',
    '到账咨询',
    array['到账', '到卡', '账期', 'T+N'],
    '门店询问收入到账时间',
    '适合配合核算工具结果一起发送。',
    'default'
  ),
  (
    '门店反馈到账金额和营收金额不一致',
    '您好，到账金额与营收金额存在差异通常与平台抽佣、退款、优惠、配送费、平台补贴或账期拆分有关。我们会按订单明细和结算口径逐项核对，确认后同步差异原因。',
    '金额差异',
    array['金额不一致', '差异', '抽佣', '退款'],
    '解释到账金额和经营流水差异',
    '',
    'default'
  ),
  (
    '同事问字段口径是什么意思',
    '这个字段需要结合数据中心口径理解，建议先确认它表示的是经营流水、入账金额还是最终到卡金额。不同字段的统计范围和账期归属不同，不能直接混用。',
    '字段口径',
    array['字段', '口径', '数据中心', '公式'],
    '解释字段含义或避免误用字段',
    '',
    'default'
  ),
  (
    '账单上传后需要拆分或打包',
    '您好，请先上传平台原始账单文件，系统会按字段映射完成清洗和拆分。处理完成后可下载 Zip 包，里面包含汇总表、清洗日志和拆分后的账单文件。',
    '账单处理',
    array['上传', '账单', '拆分', 'Zip'],
    '指导账单处理流程',
    '',
    'default'
  ),
  (
    '对方催促核对进度',
    '您好，这边正在核对平台账单、门店流水和到账记录。涉及跨账期或金额差异的部分需要逐项确认，核对完成后会第一时间同步结果。',
    '进度反馈',
    array['进度', '催促', '核对', '对账'],
    '回复对账处理中',
    '',
    'default'
  ),
  (
    '缺少必要账单或字段无法核对',
    '您好，目前还缺少核对所需的账单或关键字段，暂时无法确认最终结果。请补充对应平台账单、门店信息或到账记录，我们收到后继续处理。',
    '资料补充',
    array['缺资料', '缺字段', '补充', '无法核对'],
    '需要对方补充资料',
    '',
    'default'
  )
on conflict (source, question) where is_active = true do nothing;
