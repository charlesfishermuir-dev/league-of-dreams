-- Fix: a variable named 'balls' clashed with the lottery_odds.balls column.
create or replace function _draw_lottery(p_year int, p_by text) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  based int := p_year - 1;
  ids int[]; names text[]; v_balls numeric[]; weights bigint[];
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
  select array_agg(o.balls order by o.seed) into v_balls from lottery_odds o;
  if exists (select 1 from lottery_odds o where o.balls is null) then
    raise exception 'The lottery odds aren''t all set yet.';
  end if;
  select array_agg(round(b * 1000)::bigint) into weights from unnest(v_balls) as b;
  select sum(b) into sum_balls from unnest(v_balls) as b;

  for i in 1..8 loop
    entrants := entrants || jsonb_build_object('seed', i, 'franchise_id', ids[i], 'team_name', names[i],
                                               'balls', v_balls[i], 'chance_first', v_balls[i] / sum_balls);
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
