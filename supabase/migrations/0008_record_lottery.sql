-- Saves a lottery result in one step: the draft, its 12-slot order and the
-- lottery record (with the random numbers used). Commissioners only, and only
-- once per draft year, so a lottery can never be re-run.
create function record_lottery(p_year int, p_based_on int, p_order jsonb, p_entrants jsonb, p_draws jsonb)
  returns void
  language plpgsql security definer set search_path = public
as $$
declare
  o jsonb;
begin
  if not is_admin() then raise exception 'Only the commissioner can run the lottery.'; end if;
  if exists (select 1 from draft_lotteries where year = p_year) or exists (select 1 from drafts where year = p_year) then
    raise exception 'The % draft order already exists. A lottery can only be run once.', p_year;
  end if;
  if jsonb_array_length(p_order) <> 12 then raise exception 'The draft order must have 12 slots.'; end if;

  insert into drafts (year, based_on, source) values (p_year, p_based_on, 'site');
  for o in select * from jsonb_array_elements(p_order) loop
    insert into draft_order (year, slot, franchise_id, how, seed)
    values (p_year, (o ->> 'slot')::int, (o ->> 'franchise_id')::int, o ->> 'how', (o ->> 'seed')::int);
  end loop;
  insert into draft_lotteries (year, run_by, entrants, draws)
  values (p_year, auth.jwt() ->> 'email', p_entrants, p_draws);
end;
$$;
revoke all on function record_lottery(int, int, jsonb, jsonb, jsonb) from public, anon;
grant execute on function record_lottery(int, int, jsonb, jsonb, jsonb) to authenticated;
