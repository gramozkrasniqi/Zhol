-- Trigger-funktionen ska aldrig kunna anropas via API:t.
-- is_table_member används av RLS-policyerna och visar bara den inloggades egna medlemskap.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_table_member(uuid) from public, anon;
grant execute on function public.is_table_member(uuid) to authenticated;
