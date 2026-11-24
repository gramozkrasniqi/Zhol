-- Tidsgräns per drag och avhopp.
-- turn_deadline: när den som har turen senast måste spela.
-- strikes: antal missade turer i rad per plats, t.ex. {"0": 1}.
-- outcome: hur partiet slutade om det inte var en vanlig vinst, t.ex. {"type":"forfeit","seat":1,"reason":"timeout"}.

alter table public.games
  add column turn_deadline timestamptz,
  add column strikes jsonb not null default '{}'::jsonb,
  add column outcome jsonb;

drop function if exists public.save_game(uuid, int, jsonb, jsonb, jsonb);

create or replace function public.save_game(
  p_game uuid, p_version int, p_public jsonb, p_state jsonb, p_hands jsonb,
  p_deadline timestamptz, p_strikes jsonb, p_outcome jsonb, p_over boolean
) returns int
language plpgsql security definer set search_path = public as $$
declare v int; h jsonb;
begin
  update games set public = p_public, version = version + 1,
         turn_deadline = p_deadline, strikes = p_strikes, outcome = p_outcome,
         finished_at = case when p_over then now() else finished_at end
   where id = p_game and version = p_version and finished_at is null
   returning version into v;
  if v is null then raise exception 'conflict' using errcode = '40001'; end if;
  update game_secrets set state = p_state where game_id = p_game;
  for h in select * from jsonb_array_elements(p_hands) loop
    update game_hands set cards = h->'cards'
     where game_id = p_game and seat = (h->>'seat')::int;
  end loop;
  return v;
end $$;

revoke execute on function public.save_game(uuid, int, jsonb, jsonb, jsonb, timestamptz, jsonb, jsonb, boolean) from public, anon, authenticated;
