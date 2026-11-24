-- Plattform för flera spel: varje bord har ett spel, ranking hålls per spel.

alter table public.tables add column game text not null default 'zhol';
alter table public.tables drop constraint if exists tables_variant_check;
alter table public.tables add constraint tables_variant_format check (variant ~ '^[a-z0-9_-]{1,20}$');
alter table public.tables drop constraint if exists tables_seats_check;
alter table public.tables add constraint tables_seats_range check (seats between 2 and 8);
drop index if exists tables_waiting_idx;
create index tables_waiting_idx on public.tables (status, ranked, game, variant, seats);

create table public.ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null,
  elo int not null default 1200,
  games int not null default 0,
  wins int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);
create index ratings_board_idx on public.ratings (game, elo desc);
alter table public.ratings enable row level security;
create policy "ranking syns för inloggade" on public.ratings for select to authenticated using (true);

alter table public.elo_history add column game text not null default 'zhol';

alter table public.profiles drop column elo, drop column games, drop column wins;
