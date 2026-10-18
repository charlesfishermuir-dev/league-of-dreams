-- Scheduled lottery: the commissioner picks a time; the database runs the
-- draw itself at that minute (pg_cron), so it happens even if nobody has the
-- site open. The draw happens here, in one place, for both the scheduled run
-- and the manual "Run the lottery" button.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

create table lottery_schedule (
  year       int primary key,
  run_at     timestamptz not null,
  status     text not null default 'scheduled' check (status in ('scheduled', 'done')),
  last_error text,                      -- why it hasn't run yet (e.g. odds missing); retried every minute
  created_by text,
  updated_at timestamptz not null default now()
);
alter table lottery_schedule enable row level security;
create policy "public read" on lottery_schedule for select using (true);
create policy "admin insert" on lottery_schedule for insert with check (is_admin());
create policy "admin update" on lottery_schedule for update using (is_admin()) with check (is_admin());
create policy "admin delete" on lottery_schedule for delete using (is_admin() and status = 'scheduled');

-- A uniformly random whole number from 0 to n-1, from the database's
-- cryptographic random source (rejection sampling, so there's no bias).
create function _random_below(n bigint) returns bigint
  language plpgsql volatile set search_path = public, extensions
as $$
declare
  r bigint;
  lim bigint := (9223372036854775807 / n) * n;
begin
  if n <= 0 then raise exception 'n must be positive'; end if;
  loop
    r := ('x' || encode(extensions.gen_random_bytes(8), 'hex'))::bit(64)::bigint & 9223372036854775807;
    exit when r < lim;
  end loop;
  return r % n;
end;
$$;

-- The draw. Internal: called only by the two functions below.
create function _draw_lottery(p_year int, p_by text) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  based int := p_year - 1;
  ids int[]; names text[]; balls numeric[]; weights bigint[];
  taken boolean[] := array[false,false,false,false,false,false,false,false];
  total bigint; roll bigint; acc bigint; winner int;
  draws jsonb := '[]'::jsonb; ord jsonb := '[]'::jsonb; entrants jsonb := '[]'::jsonb;
  sum_balls numeric; i int; pick int; p record; slot int := 9;
begin
  if exists (select 1 from drafts where year = p_year) then
    raise exception 'The % draft order already exists. A lottery can only be run once.', p_year;
  end if;
  if not exists (select 1 from team_seasons where year = based and finish = 'champion') then
    raise exception 'The % season isn''t finished, so the lottery teams aren''t final.', based;
  end if;

  -- Seeds 1-8: non-playoff teams, worst record first.
  select array_agg(franchise_id order by place desc), array_agg(team_name order by place desc)
    into ids, names
    from (select franchise_id, team_name, place from team_seasons
          where year = based and finish is null order by place desc limit 8) t;
  if coalesce(array_length(ids, 1), 0) <> 8 then raise exception 'Expected 8 lottery teams.'; end if;
  select array_agg(balls order by seed) into balls from lottery_odds;
  if exists (select 1 from lottery_odds where balls is null) then
    raise exception 'The lottery odds aren''t all set yet.';
  end if;
  select array_agg(round(b * 1000)::bigint) into weights from unnest(balls) as b;
  select sum(b) into sum_balls from unnest(balls) as b;

  for i in 1..8 loop
    entrants := entrants || jsonb_build_object('seed', i, 'franchise_id', ids[i], 'team_name', names[i],
                                               'balls', balls[i], 'chance_first', balls[i] / sum_balls);
  end loop;

  -- Picks 1-8, one at a time; a drawn team's balls leave the pool.
  for pick in 1..8 loop
    total := 0;
    for i in 1..8 loop if not taken[i] then total := total + weights[i]; end if; end loop;
    roll := _random_below(total);
    acc := 0;
    for i in 1..8 loop
      if not taken[i] then
        acc := acc + weights[i];
        if acc > roll then winner := i; exit; end if;
      end if;
    end loop;
    taken[winner] := true;
    draws := draws || jsonb_build_object('pick', pick, 'roll', roll, 'out_of', total, 'franchise_id', ids[winner]);
    ord := ord || jsonb_build_object('slot', pick, 'franchise_id', ids[winner], 'how', 'lottery', 'seed', winner);
  end loop;

  -- Picks 9-12: semifinal losers (worse record first), runner-up, champion.
  for p in select franchise_id from team_seasons where year = based and finish is not null
           order by case finish when 'champion' then 3 when 'runner_up' then 2 else 1 end, place desc loop
    ord := ord || jsonb_build_object('slot', slot, 'franchise_id', p.franchise_id, 'how', 'playoffs', 'seed', null);
    slot := slot + 1;
  end loop;
  if jsonb_array_length(ord) <> 12 then raise exception 'Expected 4 playoff teams.'; end if;

  insert into drafts (year, based_on, source) values (p_year, based, 'site');
  insert into draft_order (year, slot, franchise_id, how, seed)
    select p_year, (o ->> 'slot')::int, (o ->> 'franchise_id')::int, o ->> 'how', (o ->> 'seed')::int
    from jsonb_array_elements(ord) o;
  insert into draft_lotteries (year, run_by, entrants, draws) values (p_year, p_by, entrants, draws);
  update lottery_schedule set status = 'done', last_error = null, updated_at = now() where year = p_year;
end;
$$;
revoke all on function _draw_lottery(int, text) from public, anon, authenticated;
revoke all on function _random_below(bigint) from public, anon, authenticated;

-- Commissioner's "Run the lottery" button.
create function run_lottery_now(p_year int) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'Only the commissioner can run the lottery.'; end if;
  perform _draw_lottery(p_year, auth.jwt() ->> 'email');
end;
$$;
revoke all on function run_lottery_now(int) from public, anon;
grant execute on function run_lottery_now(int) to authenticated;

-- Runs every minute: draws any scheduled lottery whose time has come.
-- If something isn't ready (e.g. odds missing), it records why and tries again next minute.
create function run_due_lotteries() returns void
  language plpgsql security definer set search_path = public
as $$
declare s record;
begin
  for s in select * from lottery_schedule where status = 'scheduled' and run_at <= now() loop
    begin
      perform _draw_lottery(s.year, 'scheduled');
    exception when others then
      update lottery_schedule set last_error = sqlerrm, updated_at = now() where year = s.year;
    end;
  end loop;
end;
$$;
revoke all on function run_due_lotteries() from public, anon, authenticated;

-- The old two-step path is replaced by run_lottery_now.
drop function record_lottery(int, int, jsonb, jsonb, jsonb);

select cron.schedule('league-lottery-autorun', '* * * * *', 'select public.run_due_lotteries()');
