-- The 5-round keeper draft and the draft-position lottery.
-- "Draft year" is the season the draft is for: the 2027 draft is held after
-- the 2026 season and its order comes from the 2026 results.

create table drafts (
  year        int primary key,
  based_on    int not null,                 -- season whose results set the order
  source      text not null,                -- 'sheet' (imported) or 'site' (lottery run here)
  notes       text
);

-- Who picks in each slot (the same order every round; traded picks show in draft_picks).
create table draft_order (
  year         int not null references drafts(year) on delete cascade,
  slot         int not null check (slot between 1 and 12),
  franchise_id int not null references franchises(id),
  how          text not null check (how in ('lottery', 'playoffs')),
  seed         int,                          -- lottery entrants: 1 = worst record
  primary key (year, slot)
);

create table draft_picks (
  year         int not null references drafts(year) on delete cascade,
  pick         int not null,                 -- 1..60
  round        int not null,
  slot         int not null,
  player       text,                         -- null = pick forfeited / not recorded
  franchise_id int references franchises(id),          -- team that made the pick
  origin_franchise_id int references franchises(id),   -- team the slot belonged to
  primary key (year, pick)
);

-- Lottery odds by seed (1 = worst record ... 8 = best non-playoff record), set by the commissioner.
-- "balls" can be any positive numbers (balls, percentages, ...); chances are proportional.
create table lottery_odds (
  seed  int primary key check (seed between 1 and 8),
  balls numeric check (balls is null or balls > 0)
);
insert into lottery_odds (seed) select generate_series(1, 8);

-- A lottery run on the site. Inserted once and never changed: no re-rolls.
create table draft_lotteries (
  year      int primary key references drafts(year),
  run_at    timestamptz not null default now(),
  run_by    text,
  entrants  jsonb not null,                  -- [{seed, franchise_id, team_name, balls, chance_first}]
  draws     jsonb not null                   -- [{pick, roll, out_of, franchise_id}] the random numbers used
);

alter table drafts          enable row level security;
alter table draft_order     enable row level security;
alter table draft_picks     enable row level security;
alter table lottery_odds    enable row level security;
alter table draft_lotteries enable row level security;
create policy "public read" on drafts          for select using (true);
create policy "public read" on draft_order     for select using (true);
create policy "public read" on draft_picks     for select using (true);
create policy "public read" on lottery_odds    for select using (true);
create policy "public read" on draft_lotteries for select using (true);

create policy "admin update" on lottery_odds for update using (is_admin()) with check (is_admin());
-- Running a lottery: the website (as the commissioner) creates the draft, its order and the lottery record.
create policy "admin insert" on drafts          for insert with check (is_admin());
create policy "admin insert" on draft_order     for insert with check (is_admin());
create policy "admin insert" on draft_lotteries for insert with check (is_admin());
-- No update/delete policies on draft_lotteries or draft_order: once drawn, it stands.
