-- ============================================================
-- TILAWAH — Schema inicial (Fase 0/1)
-- Baseado nas secções 10 (Banco de dados) e 11 (Segurança) do plano.
-- Todas as tabelas privadas têm RLS ativo. auth.uid() vem do
-- Supabase Auth — não confiar em nenhum id enviado pelo cliente.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('aluno', 'qari', 'admin')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: leitura pública de campos básicos"
  on profiles for select
  using (true);

create policy "profiles: só o próprio pode alterar o seu perfil"
  on profiles for update
  using (auth.uid() = id);

create policy "profiles: só o próprio pode criar o seu perfil"
  on profiles for insert
  with check (auth.uid() = id);

-- ---------- qari_profiles ----------
create table if not exists qari_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  specialties text[] not null default '{}',
  rate_per_minute numeric(10,2) not null default 0 check (rate_per_minute >= 0),
  description text,
  created_at timestamptz not null default now()
);

alter table qari_profiles enable row level security;

create policy "qari_profiles: leitura pública"
  on qari_profiles for select
  using (true);

create policy "qari_profiles: só o próprio Qari altera o seu perfil"
  on qari_profiles for insert
  with check (auth.uid() = id);

create policy "qari_profiles: só o próprio Qari atualiza o seu perfil"
  on qari_profiles for update
  using (auth.uid() = id);

-- ---------- qari_presence ----------
create table if not exists qari_presence (
  qari_id uuid primary key references qari_profiles(id) on delete cascade,
  is_available boolean not null default false,
  last_seen timestamptz not null default now()
);

alter table qari_presence enable row level security;

create policy "qari_presence: leitura pública"
  on qari_presence for select
  using (true);

create policy "qari_presence: só o próprio Qari altera a sua disponibilidade"
  on qari_presence for insert
  with check (auth.uid() = qari_id);

create policy "qari_presence: só o próprio Qari atualiza a sua disponibilidade"
  on qari_presence for update
  using (auth.uid() = qari_id);

-- ---------- quran_surahs / quran_ayahs (referência estruturada) ----------
create table if not exists quran_surahs (
  number int primary key,
  name_ar text not null,
  name_transliteration text not null,
  total_ayahs int not null
);

alter table quran_surahs enable row level security;
create policy "quran_surahs: leitura pública" on quran_surahs for select using (true);

create table if not exists quran_ayahs (
  surah_number int not null references quran_surahs(number),
  ayah_number int not null,
  primary key (surah_number, ayah_number)
);

alter table quran_ayahs enable row level security;
create policy "quran_ayahs: leitura pública" on quran_ayahs for select using (true);

-- ---------- recitation_sessions ----------
create table if not exists recitation_sessions (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references profiles(id),
  qari_id uuid not null references profiles(id),
  surah_number int references quran_surahs(number),
  ayah_start int,
  ayah_end int,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  rate_per_minute numeric(10,2),
  total_cost numeric(10,2),
  created_at timestamptz not null default now()
);

alter table recitation_sessions enable row level security;

create policy "sessions: aluno ou qari da sessão podem ver"
  on recitation_sessions for select
  using (auth.uid() = student_id or auth.uid() = qari_id);

create policy "sessions: aluno cria o pedido"
  on recitation_sessions for insert
  with check (auth.uid() = student_id);

create policy "sessions: aluno ou qari da sessão podem atualizar estado"
  on recitation_sessions for update
  using (auth.uid() = student_id or auth.uid() = qari_id);

-- Nota (secção 11): preço, duração e total nunca devem ser confiados
-- ao cliente em produção — validar/recalcular no servidor (Edge
-- Function ou trigger) antes de fechar a sessão como 'completed'.

-- ---------- session_feedback ----------
create table if not exists session_feedback (
  session_id uuid primary key references recitation_sessions(id) on delete cascade,
  recitation_score int check (recitation_score between 1 and 5),
  tajwid_score int check (tajwid_score between 1 and 5),
  makharij_score int check (makharij_score between 1 and 5),
  fluency_score int check (fluency_score between 1 and 5),
  strengths text,
  points_to_review text,
  recommendation text,
  next_surah_number int references quran_surahs(number),
  next_ayah_start int,
  next_ayah_end int,
  created_at timestamptz not null default now()
);

alter table session_feedback enable row level security;

create policy "feedback: aluno ou qari da sessão podem ler"
  on session_feedback for select
  using (
    exists (
      select 1 from recitation_sessions s
      where s.id = session_id
        and (s.student_id = auth.uid() or s.qari_id = auth.uid())
    )
  );

create policy "feedback: só o qari que fez a sessão pode criar"
  on session_feedback for insert
  with check (
    exists (
      select 1 from recitation_sessions s
      where s.id = session_id and s.qari_id = auth.uid()
    )
  );

-- ---------- wallets / transactions ----------
create table if not exists wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance numeric(12,2) not null default 0
);

alter table wallets enable row level security;

create policy "wallets: só o próprio vê o seu saldo"
  on wallets for select
  using (auth.uid() = user_id);

-- Sem policy de insert/update para o cliente: saldo só é alterado
-- no servidor (service_role / Edge Function), nunca diretamente pelo browser.

create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id),
  session_id uuid references recitation_sessions(id),
  amount numeric(12,2) not null,
  type text not null check (type in ('charge', 'payout', 'refund', 'topup')),
  created_at timestamptz not null default now()
);

alter table transactions enable row level security;

create policy "transactions: só o próprio vê as suas transações"
  on transactions for select
  using (auth.uid() = user_id);

-- ---------- notifications ----------
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id),
  type text not null,
  payload jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "notifications: só o destinatário vê"
  on notifications for select
  using (auth.uid() = user_id);

create policy "notifications: qualquer utilizador autenticado pode criar (para avisar outro participante)"
  on notifications for insert
  with check (auth.uid() is not null);

create policy "notifications: só o destinatário marca como lida"
  on notifications for update
  using (auth.uid() = user_id);

-- ---------- reports (moderação) ----------
create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references profiles(id),
  target_session_id uuid references recitation_sessions(id),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table reports enable row level security;

create policy "reports: quem denuncia pode ver a própria denúncia"
  on reports for select
  using (auth.uid() = reporter_id);

create policy "reports: qualquer utilizador autenticado pode denunciar"
  on reports for insert
  with check (auth.uid() = reporter_id);

-- ============================================================
-- Sinalização WebRTC (reaproveitado do protótipo, agora com RLS
-- ligado a auth.uid() em vez de ids arbitrários gerados no cliente)
-- ============================================================

create table if not exists calls (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references recitation_sessions(id),
  caller_id uuid not null references profiles(id),
  callee_id uuid not null references profiles(id),
  offer jsonb,
  answer jsonb,
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'rejected', 'ended')),
  ended_by uuid references profiles(id),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

alter table calls enable row level security;

create policy "calls: só chamador ou destinatário veem"
  on calls for select
  using (auth.uid() = caller_id or auth.uid() = callee_id);

create policy "calls: só o chamador cria"
  on calls for insert
  with check (auth.uid() = caller_id);

create policy "calls: chamador ou destinatário atualizam (aceitar/recusar/terminar)"
  on calls for update
  using (auth.uid() = caller_id or auth.uid() = callee_id);

create table if not exists ice_candidates (
  id uuid primary key default uuid_generate_v4(),
  call_id uuid not null references calls(id) on delete cascade,
  role text not null check (role in ('caller', 'callee')),
  candidate jsonb not null,
  created_at timestamptz not null default now()
);

alter table ice_candidates enable row level security;

create policy "ice_candidates: participantes da chamada veem"
  on ice_candidates for select
  using (
    exists (
      select 1 from calls c
      where c.id = call_id and (c.caller_id = auth.uid() or c.callee_id = auth.uid())
    )
  );

create policy "ice_candidates: participantes da chamada inserem"
  on ice_candidates for insert
  with check (
    exists (
      select 1 from calls c
      where c.id = call_id and (c.caller_id = auth.uid() or c.callee_id = auth.uid())
    )
  );

-- Nota: ativar "Realtime" nas tabelas calls e ice_candidates no
-- painel do Supabase (Database → Replication) para os postgres_changes
-- funcionarem, tal como no protótipo.

-- ============================================================
-- Criação automática de perfil no signup
-- ============================================================
-- Se a confirmação de email estiver ativa no projeto, signUp() não
-- devolve sessão imediata — um insert feito pelo browser logo a
-- seguir corre sem auth.uid(), e a RLS bloqueia-o. Este trigger
-- corre no servidor (security definer), por isso não depende de
-- haver sessão no cliente: lê o nome/papel/tarifa dos metadados
-- passados em supabase.auth.signUp({ options: { data: {...} } }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Utilizador'),
    coalesce(new.raw_user_meta_data->>'role', 'aluno')
  )
  on conflict (id) do nothing;

  if coalesce(new.raw_user_meta_data->>'role', 'aluno') = 'qari' then
    insert into public.qari_profiles (id, rate_per_minute, specialties)
    values (new.id, coalesce((new.raw_user_meta_data->>'rate')::numeric, 0), '{}')
    on conflict (id) do nothing;

    insert into public.qari_presence (qari_id, is_available)
    values (new.id, false)
    on conflict (qari_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Pagamento manual (Fase 7, sem gateway) — eMola/M-Pesa
-- ============================================================
-- Sem integração de pagamento real: o aluno vê os dados da conta na
-- app, transfere manualmente, e autorreporta que pagou. O Qari decide
-- se confirma o recebimento antes de atender — não há validação
-- automática nenhuma. Isto é uma escolha deliberada para o MVP com
-- poucos Qaris de confiança (secção 19 do plano); não usar isto assim
-- se o número de utilizadores crescer sem controlo.
alter table recitation_sessions add column if not exists payment_method text check (payment_method in ('emola', 'mpesa'));
alter table recitation_sessions add column if not exists payment_estimated_minutes int;
alter table recitation_sessions add column if not exists payment_estimated_amount numeric(10,2);
alter table recitation_sessions add column if not exists payment_reported boolean not null default false;
alter table recitation_sessions add column if not exists payment_reported_at timestamptz;

-- ============================================================
-- Fase 8 — Admin
-- ============================================================
-- As políticas até aqui só deixam cada pessoa ver os seus próprios
-- dados. Um admin precisa de ver tudo, para gestão/moderação
-- (secção 6 do plano). is_admin() corre com privilégios de servidor
-- para poder ler profiles.role sem entrar num ciclo de RLS sobre a
-- própria tabela profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create policy "sessions: admin vê todas"
  on recitation_sessions for select
  using (public.is_admin());

create policy "reports: admin vê todas"
  on reports for select
  using (public.is_admin());

create policy "reports: admin pode atualizar (marcar resolvida)"
  on reports for update
  using (public.is_admin());

alter table reports add column if not exists resolved boolean not null default false;

create policy "transactions: admin vê todas"
  on transactions for select
  using (public.is_admin());

create policy "wallets: admin vê todas"
  on wallets for select
  using (public.is_admin());

-- Nota: para promover alguém a admin, correr manualmente no SQL Editor:
-- update profiles set role = 'admin' where id = '<uuid-do-utilizador>';
