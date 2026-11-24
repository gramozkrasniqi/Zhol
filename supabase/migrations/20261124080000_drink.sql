-- Dryck vid bordet: varje spelare väljer kafe (turkiskt kaffe) eller çaj (turkiskt te).
alter table public.profiles add column if not exists drink text check (drink is null or drink in ('kafe', 'caj'));
grant update (avatar, drink) on public.profiles to authenticated;
