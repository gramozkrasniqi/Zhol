-- Datorspelare (botar). De är vanliga konton med is_bot = true som servern spelar åt.
alter table public.profiles add column is_bot boolean not null default false;
