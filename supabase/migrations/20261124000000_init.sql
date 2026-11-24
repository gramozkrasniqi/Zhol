-- Zhol: konton, bord, spel, dolda händer och rating.
-- Allt som ändrar spelet går via edge function "game" (service role).
-- Klienten får bara LÄSA: sin profil, sina bord, publikt spelläge och SIN EGEN hand.

create extension if not exists pgcrypto;

-- ---------- Profiler ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 20),
  elo int not null default 1200,
  games int not null default 0,
  wins int not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'lojtar' || substr(replace(new.id::text, '-', ''), 1, 8));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Bord ----------
create table public.tables (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  variant text not null check (variant in ('small', 'big')),
  seats int not null check (seats in (2, 4)),
  ranked boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  host uuid not null references public.profiles(id) on delete cascade,
  game_id uuid,
  round int not null default 0,
  created_at timestamptz not null default now()
);
create index tables_waiting_idx on public.tables (status, ranked, variant, seats);

create table public.table_players (
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat int not null,
  joined_at timestamptz not null default now(),
  primary key (table_id, user_id),
  unique (table_id, seat)
);

-- ---------- Spel ----------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  public jsonb not null,             -- publikt läge: tur, kasthög, antal kort
  version int not null default 0,    -- skydd mot dubbla drag
  rated boolean not null default false,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Hela läget inkl. högen och alla händer. Ingen policy = ingen klient kan läsa.
create table public.game_secrets (
  game_id uuid primary key references public.games(id) on delete cascade,
  state jsonb not null
);

create table public.game_hands (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat int not null,
  cards jsonb not null,
  primary key (game_id, user_id)
);

create table public.elo_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  elo_before int not null,
  elo_after int not null,
  created_at timestamptz not null default now()
);

-- ---------- Behörigheter ----------
create or replace function public.is_table_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from table_players where table_id = t and user_id = auth.uid())
$$;

alter table public.profiles enable row level security;
alter table public.tables enable row level security;
alter table public.table_players enable row level security;
alter table public.games enable row level security;
alter table public.game_secrets enable row level security;
alter table public.game_hands enable row level security;
alter table public.elo_history enable row level security;

create policy "profiler syns för inloggade" on public.profiles for select to authenticated using (true);
create policy "medlemmar ser bordet" on public.tables for select to authenticated using (public.is_table_member(id));
create policy "medlemmar ser spelarna" on public.table_players for select to authenticated using (public.is_table_member(table_id));
create policy "medlemmar ser spelet" on public.games for select to authenticated using (public.is_table_member(table_id));
create policy "bara egen hand" on public.game_hands for select to authenticated using (user_id = auth.uid());
create policy "egen historik" on public.elo_history for select to authenticated using (user_id = auth.uid());
-- game_secrets: medvetet ingen policy.

-- ---------- Atomisk sparning av ett drag ----------
create or replace function public.save_game(
  p_game uuid, p_version int, p_public jsonb, p_state jsonb, p_hands jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare v int; h jsonb;
begin
  update games set public = p_public, version = version + 1,
         finished_at = case when p_public->>'phase' = 'over' then now() else finished_at end
   where id = p_game and version = p_version
   returning version into v;
  if v is null then raise exception 'conflict' using errcode = '40001'; end if;
  update game_secrets set state = p_state where game_id = p_game;
  for h in select * from jsonb_array_elements(p_hands) loop
    update game_hands set cards = h->'cards'
     where game_id = p_game and seat = (h->>'seat')::int;
  end loop;
  return v;
end $$;

revoke execute on function public.save_game(uuid, int, jsonb, jsonb, jsonb) from public, anon, authenticated;

-- ---------- Realtid ----------
alter publication supabase_realtime add table public.games, public.game_hands, public.table_players, public.tables;
