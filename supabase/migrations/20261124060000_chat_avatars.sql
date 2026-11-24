-- Chatt vid bordet och egna avatarer.

-- ---------- Chatt ----------
create table public.table_messages (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index table_messages_table_idx on public.table_messages (table_id, created_at desc);
alter table public.table_messages enable row level security;

create policy "medlemmar läser chatten" on public.table_messages for select to authenticated
  using (public.is_table_member(table_id));
create policy "medlemmar skriver i chatten" on public.table_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_table_member(table_id));

-- Högst 5 meddelanden per 10 sekunder per person
create or replace function public.chat_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from table_messages where user_id = new.user_id and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Du skriver för snabbt – vänta en stund' using errcode = 'P0001';
  end if;
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.chat_rate_limit() from public, anon, authenticated;
create trigger table_messages_rate before insert on public.table_messages
  for each row execute function public.chat_rate_limit();

alter publication supabase_realtime add table public.table_messages;

-- ---------- Avatarer ----------
-- 'preset:<namn>' eller en publik bild i lagringen avatars/<användar-id>/...
alter table public.profiles add column avatar text check (
  avatar is null
  or avatar ~ '^preset:[a-z0-9-]{1,20}$'
  or avatar ~ '^https://cbyljdubmeizwzinqtrd\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}/avatar\.(webp|jpg|png)(\?v=[0-9]+)?$'
);

-- Spelaren får bara ändra sin egen avatar (inte namn, bot-flagga eller annat)
revoke update on public.profiles from authenticated, anon;
grant update (avatar) on public.profiles to authenticated;
create policy "egen avatar" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Lagring för uppladdade bilder: alla kan se, bara ägaren kan skriva i sin egen mapp
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 300000, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "avatarer syns" on storage.objects for select using (bucket_id = 'avatars');
create policy "egen avatarbild in" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "egen avatarbild byt" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "egen avatarbild bort" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
