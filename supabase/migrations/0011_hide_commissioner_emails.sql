-- Commissioner emails recorded on changes (who wrote a post, saved the rules,
-- ran the lottery...) are for commissioners only. Visitors can read every
-- other column of these tables, but not the email columns.

revoke select on news from anon;
grant select (id, slug, kind, title, body, published, published_at, created_at, updated_at) on news to anon;

revoke select on rules_versions from anon;
grant select (id, body, note, created_at) on rules_versions to anon;

revoke select on record_overrides from anon;
grant select (id, year, franchise_id, field, value, old_value, reason, created_at) on record_overrides to anon;

revoke select on lottery_schedule from anon;
grant select (year, run_at, status, last_error, updated_at) on lottery_schedule to anon;

revoke select on draft_lotteries from anon;
grant select (year, run_at, entrants, draws) on draft_lotteries to anon;
