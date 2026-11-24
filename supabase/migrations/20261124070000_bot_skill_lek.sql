-- Botarnas skicklighet (0 = nybörjare, 1 = expert) och tempo (sekunder per drag i snitt).
alter table public.profiles add column bot_skill real check (bot_skill between 0 and 1);
alter table public.profiles add column bot_speed real check (bot_speed between 0.5 and 6);
update public.profiles set bot_skill = round((0.15 + random() * 0.85)::numeric, 2), bot_speed = round((1 + random() * 2.5)::numeric, 1)
 where is_bot and bot_skill is null;

-- Spelvalutan heter Lek
create or replace function public.chip_move(p_user uuid, p_delta bigint, p_reason text, p_ref uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare b bigint;
begin
  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  update wallets set balance = balance + p_delta, updated_at = now()
   where user_id = p_user and balance + p_delta >= 0
   returning balance into b;
  if b is null then raise exception 'Inte tillräckligt med Lek' using errcode = 'P0001'; end if;
  insert into chip_ledger (user_id, delta, balance_after, reason, ref) values (p_user, p_delta, b, p_reason, p_ref);
  return b;
end $$;

create or replace function public.claim_daily(p_user uuid, p_amount bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/Stockholm')::date; n int;
begin
  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  update wallets set last_daily = today where user_id = p_user and (last_daily is null or last_daily < today);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Du har redan hämtat dagens Lek' using errcode = 'P0001'; end if;
  return chip_move(p_user, p_amount, 'daily', null);
end $$;
revoke execute on function public.chip_move(uuid, bigint, text, uuid) from public, anon, authenticated;
revoke execute on function public.claim_daily(uuid, bigint) from public, anon, authenticated;
