-- League history: franchises, managers, seasons, standings, matchups.
-- Everything here is publicly readable; only the import/sync scripts (which
-- connect as the database owner) can write.

create table managers (
  id          serial primary key,
  name        text not null unique,
  slug        text not null unique
);

-- A franchise is a seat in the league. It keeps its history through name
-- changes and (rarely) a change of manager.
create table franchises (
  id          serial primary key,
  slug        text not null unique,
  name        text not null,           -- current / most recent name
  short_name  text,
  active      boolean not null default false,
  fantrax_team_id text unique
);

create table seasons (
  year        int primary key,
  league_name text,
  num_teams   int,
  categories  text[] not null,         -- scoring categories in display order
  notes       text,
  source      text not null            -- 'sheet' or 'fantrax'
);

create table team_seasons (
  id            serial primary key,
  year          int not null references seasons(year) on delete cascade,
  franchise_id  int not null references franchises(id),
  manager_id    int references managers(id),
  manager_label text not null,         -- as written, e.g. 'Myron/Anter'
  team_name     text not null,
  place         int not null,          -- regular-season finish, 1..12
  wins          int not null,
  losses        int not null,
  ties          int not null,
  finish        text,                  -- playoff result: champion, runner_up, semifinal, third, fourth
  playoff_seed  int,
  stats         jsonb not null default '{}',  -- season category totals
  source        text not null,
  unique (year, franchise_id),
  unique (year, place)
);

create table matchups (
  id            serial primary key,
  year          int not null references seasons(year) on delete cascade,
  period        int,                   -- scoring period (week); null if unknown
  stage         text not null,         -- 'regular', 'semifinal', 'final', 'third_place'
  home_id       int not null references franchises(id),
  away_id       int not null references franchises(id),
  home_seed     int,
  away_seed     int,
  home_w int not null, home_l int not null, home_t int not null,
  home_stats    jsonb not null default '{}',
  away_stats    jsonb not null default '{}',
  source        text not null
);
create index on matchups (year, stage);
create index on matchups (home_id);
create index on matchups (away_id);

-- Read-only public access.
alter table managers     enable row level security;
alter table franchises   enable row level security;
alter table seasons      enable row level security;
alter table team_seasons enable row level security;
alter table matchups     enable row level security;
create policy "public read" on managers     for select using (true);
create policy "public read" on franchises   for select using (true);
create policy "public read" on seasons      for select using (true);
create policy "public read" on team_seasons for select using (true);
create policy "public read" on matchups     for select using (true);
