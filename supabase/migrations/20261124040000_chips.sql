-- Låtsasmarker. Markerna har inget värde i pengar och kan inte tas ut eller föras över.
-- Saldot ändras bara via chip_move (servern), och varje ändring loggas i chip_ledger.

create table public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  last_daily date,
  updated_at timestamptz not null default now()
);

create table public.chip_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta bigint not null,
  balance_after bigint not null,
  reason text not null check (reason in ('welcome', 'daily', 'stake', 'payout', 'refund', 'purchase', 'admin')),
  ref uuid,
  created_at timestamptz not null default now()
);
-- Samma utbetalning/insats kan aldrig bokas två gånger för samma parti
create unique index chip_ledger_once on public.chip_ledger (user_id, reason, ref) where ref is not null;
create index chip_ledger_user_idx on public.chip_ledger (user_id, created_at desc);

alter table public.wallets enable row level security;
alter table public.chip_ledger enable row level security;
create policy "eget saldo" on public.wallets for select to authenticated using (user_id = auth.uid());
create policy "egen historik" on public.chip_ledger for select to authenticated using (user_id = auth.uid());

alter table public.tables add column stake int not null default 0 check (stake >= 0 and stake <= 100000);

-- En ändring av saldot. Kastar 'Inte tillräckligt med marker' om saldot skulle bli negativt.
create or replace function public.chip_move(p_user uuid, p_delta bigint, p_reason text, p_ref uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare b bigint;
begin
  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  update wallets set balance = balance + p_delta, updated_at = now()
   where user_id = p_user and balance + p_delta >= 0
   returning balance into b;
  if b is null then raise exception 'Inte tillräckligt med marker' using errcode = 'P0001'; end if;
  insert into chip_ledger (user_id, delta, balance_after, reason, ref) values (p_user, p_delta, b, p_reason, p_ref);
  return b;
end $$;

-- Drar insatsen från alla spelare i ett parti, allt eller inget.
create or replace function public.charge_stakes(p_game uuid, p_users uuid[], p_stake bigint)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if p_stake <= 0 then return; end if;
  foreach u in array p_users loop
    perform chip_move(u, -p_stake, 'stake', p_game);
  end loop;
end $$;

-- Dagliga marker: en gång per kalenderdag (svensk tid).
create or replace function public.claim_daily(p_user uuid, p_amount bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/Stockholm')::date; n int;
begin
  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  update wallets set last_daily = today where user_id = p_user and (last_daily is null or last_daily < today);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Du har redan hämtat dagens marker' using errcode = 'P0001'; end if;
  return chip_move(p_user, p_amount, 'daily', null);
end $$;

revoke execute on function public.chip_move(uuid, bigint, text, uuid) from public, anon, authenticated;
revoke execute on function public.charge_stakes(uuid, uuid[], bigint) from public, anon, authenticated;
revoke execute on function public.claim_daily(uuid, bigint) from public, anon, authenticated;

-- Nya spelare får välkomstmarker
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'lojtar' || substr(replace(new.id::text, '-', ''), 1, 8));
  perform public.chip_move(new.id, 1000, 'welcome', null);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter publication supabase_realtime add table public.wallets;
