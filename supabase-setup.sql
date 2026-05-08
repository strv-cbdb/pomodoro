-- ============================================================
-- STUDY QUEST - Supabase テーブルセットアップ
-- ============================================================
-- 手順:
--   Supabase ダッシュボード > SQL Editor > 新規クエリ に貼り付けて実行
-- ============================================================

-- テーブル作成
create table study_sessions (
  id               bigserial    primary key,
  username         text         not null,
  duration_seconds integer      not null,
  ended_at         timestamptz  not null default now()
);

-- インデックス (ユーザー名 + 日時で絞り込むクエリが速くなる)
create index idx_study_sessions_username_ended_at
  on study_sessions (username, ended_at);

-- 行レベルセキュリティを有効化
alter table study_sessions enable row level security;

-- INSERT ポリシー (誰でも書き込み可)
create policy "allow insert"
  on study_sessions
  for insert
  with check (true);

-- SELECT ポリシー (誰でも読み込み可)
create policy "allow select"
  on study_sessions
  for select
  using (true);

-- ============================================================
-- ユーザープロフィール (モンスター名など)
-- ============================================================

create table user_profiles (
  username     text primary key,
  monster_name text not null
);

alter table user_profiles enable row level security;

create policy "allow insert" on user_profiles for insert with check (true);
create policy "allow select" on user_profiles for select using (true);
create policy "allow update" on user_profiles for update using (true);
