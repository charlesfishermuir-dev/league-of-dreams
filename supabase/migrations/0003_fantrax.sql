-- Live data from Fantrax: weekly periods, matchup status, rosters,
-- transactions, and a record of every sync so the site can show
-- "last updated" and keep working when Fantrax is down.

alter table seasons add column fantrax_league_id text;
alter table seasons add column current_period int;       -- the week shown on the home scoreboard
alter table seasons add column is_current boolean not null default false;

-- Fantrax gives every team a new id each season.
create table fantrax_teams (
  league_id    text not null,
  team_id      text not null,
  year         int not null,
  franchise_id int not null references franchises(id),
  name         text not null,
  short_name   text,
  logo_url     text,
  primary key (league_id, team_id)
);

-- Scoring periods ("weeks").
create table periods (
  year        int not null references seasons(year) on delete cascade,
  period      int not null,
  label       text not null,             -- e.g. 'Week 16' or 'Playoffs - Round 1'
  start_date  date,
  end_date    date,
  is_playoffs boolean not null default false,
  primary key (year, period)
);

alter table matchups add column fantrax_matchup_id text;
alter table matchups add column status text not null default 'final'
  check (status in ('final', 'live', 'upcoming'));
-- 2020 was all-play: every team met every other team every week.
alter table matchups add column all_play boolean not null default false;
create unique index matchups_fantrax_key on matchups (year, period, fantrax_matchup_id)
  where fantrax_matchup_id is not null;

create table rosters (
  id           serial primary key,
  year         int not null,
  franchise_id int not null references franchises(id),
  player_id    text not null,
  name         text not null,
  positions    text,                     -- eligible positions, e.g. '2B,SS'
  slot         text,                     -- lineup slot, e.g. 'SS', 'UT', 'BN'
  status       text not null,            -- 'active', 'reserve', 'injured', 'minors'
  mlb_team     text,
  headshot_url text,
  injury       text,
  unique (year, franchise_id, player_id)
);

create table transactions (
  id           serial primary key,
  fantrax_set_id text not null,          -- one claim+drop share a set id
  year         int not null,
  occurred_at  timestamptz,
  type         text not null,            -- 'claim', 'drop', 'trade', ...
  franchise_id int references franchises(id),
  player_id    text,
  player_name  text not null,
  player_positions text,
  player_mlb_team text,
  unique (fantrax_set_id, player_id, type)
);
create index on transactions (occurred_at desc);

-- One row per kind of data the sync pulls. The site shows these times.
create table sync_status (
  dataset      text primary key,         -- 'standings', 'matchups', 'rosters', 'transactions'
  last_attempt timestamptz,
  last_success timestamptz,
  ok           boolean,
  message      text
);

alter table fantrax_teams enable row level security;
alter table periods       enable row level security;
alter table rosters       enable row level security;
alter table transactions  enable row level security;
alter table sync_status   enable row level security;
create policy "public read" on fantrax_teams for select using (true);
create policy "public read" on periods       for select using (true);
create policy "public read" on rosters       for select using (true);
create policy "public read" on transactions  for select using (true);
create policy "public read" on sync_status   for select using (true);
