-- Commissioner tools: who can edit, and the content they edit.
-- Visitors can read; only signed-in emails in `admins` can write. The
-- database enforces this (row-level security), not just the website.

create table admins (
  email text primary key check (email = lower(email))
);
alter table admins enable row level security;  -- no policies: nobody reads or changes it through the API
-- Commissioners are added with scripts/admins.py (kept out of the code so emails aren't public).

create function is_admin() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
grant execute on function is_admin() to anon, authenticated;

-- ---------- news ----------
create table news (
  id           serial primary key,
  slug         text not null unique,
  kind         text not null default 'announcement'
               check (kind in ('announcement', 'trade', 'power_rankings', 'recap')),
  title        text not null,
  body         text not null default '',      -- Markdown
  published    boolean not null default false,
  published_at timestamptz,
  author_email text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on news (published, published_at desc);
alter table news enable row level security;
create policy "read published" on news for select using (published or is_admin());
create policy "admin insert" on news for insert with check (is_admin());
create policy "admin update" on news for update using (is_admin()) with check (is_admin());
create policy "admin delete" on news for delete using (is_admin());

-- ---------- rules (every save is kept, so nothing is ever lost) ----------
create table rules_versions (
  id         serial primary key,
  body       text not null,                   -- Markdown
  note       text,                            -- e.g. 'Added keeper deadline'
  created_at timestamptz not null default now(),
  created_by text
);
alter table rules_versions enable row level security;
create policy "public read" on rules_versions for select using (true);
create policy "admin insert" on rules_versions for insert with check (is_admin());

-- ---------- awards ----------
create table awards (
  id           serial primary key,
  year         int not null,
  name         text not null,                 -- e.g. 'Sacko', 'Trade of the Year'
  franchise_id int references franchises(id),
  recipient    text,                          -- free text when it isn't a team (or to add detail)
  note         text,
  created_at   timestamptz not null default now()
);
alter table awards enable row level security;
create policy "public read" on awards for select using (true);
create policy "admin insert" on awards for insert with check (is_admin());
create policy "admin update" on awards for update using (is_admin()) with check (is_admin());
create policy "admin delete" on awards for delete using (is_admin());

-- ---------- record corrections made on the website ----------
-- Kept separately and re-applied after every import/sync, so a re-run never undoes them.
create table record_overrides (
  id           serial primary key,
  year         int not null,
  franchise_id int not null references franchises(id),
  field        text not null check (field in ('wins', 'losses', 'ties', 'team_name', 'place', 'finish')
                                    or field like 'stats.%'),
  value        text,                          -- new value (text; converted on apply)
  old_value    text,                          -- what it was, shown in the list
  reason       text not null,
  created_at   timestamptz not null default now(),
  created_by   text,
  unique (year, franchise_id, field)
);
alter table record_overrides enable row level security;
create policy "public read" on record_overrides for select using (true);
create policy "admin insert" on record_overrides for insert with check (is_admin());
create policy "admin update" on record_overrides for update using (is_admin()) with check (is_admin());
create policy "admin delete" on record_overrides for delete using (is_admin());

-- Apply every override to team_seasons. Called by the import and the sync
-- after they write, and by the website after a commissioner saves one.
create function apply_record_overrides() returns int
  language plpgsql security definer set search_path = public
as $$
declare
  o record;
  n int := 0;
begin
  -- Website callers carry a login (auth.role() is set) and must be admins.
  -- The import/sync connect to the database directly (no login) and may run it.
  if auth.role() is not null and not is_admin() then
    raise exception 'not allowed';
  end if;
  for o in select * from record_overrides loop
    if o.field like 'stats.%' then
      update team_seasons set stats = case when o.value is null
          then stats - substr(o.field, 7)
          else jsonb_set(stats, array[substr(o.field, 7)], to_jsonb(o.value::numeric)) end
        where year = o.year and franchise_id = o.franchise_id;
    else
      update team_seasons set
          wins      = case when o.field = 'wins'      then o.value::int else wins end,
          losses    = case when o.field = 'losses'    then o.value::int else losses end,
          ties      = case when o.field = 'ties'      then o.value::int else ties end,
          place     = case when o.field = 'place'     then o.value::int else place end,
          team_name = case when o.field = 'team_name' then o.value else team_name end,
          finish    = case when o.field = 'finish'    then nullif(o.value, '') else finish end
        where year = o.year and franchise_id = o.franchise_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function apply_record_overrides() from public;
grant execute on function apply_record_overrides() to authenticated;

-- Admins may restore a single field to a value (used when an override is deleted).
create function restore_record_field(p_year int, p_franchise int, p_field text, p_value text) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if p_field like 'stats.%' then
    update team_seasons set stats = case when p_value is null then stats - substr(p_field, 7)
        else jsonb_set(stats, array[substr(p_field, 7)], to_jsonb(p_value::numeric)) end
      where year = p_year and franchise_id = p_franchise;
  elsif p_field in ('wins', 'losses', 'ties', 'place') then
    execute format('update team_seasons set %I = $1::int where year = $2 and franchise_id = $3', p_field)
      using p_value, p_year, p_franchise;
  elsif p_field in ('team_name', 'finish') then
    execute format('update team_seasons set %I = nullif($1, '''') where year = $2 and franchise_id = $3', p_field)
      using p_value, p_year, p_franchise;
  end if;
end;
$$;
revoke all on function restore_record_field(int, int, text, text) from public;
grant execute on function restore_record_field(int, int, text, text) to authenticated;
