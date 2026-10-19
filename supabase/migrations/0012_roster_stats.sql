-- Each rostered player's season stats as Fantrax shows them on the roster page
-- (e.g. {"HR": "27", "AVG": ".275"}), for player spotlights.
alter table rosters add column stats jsonb not null default '{}';
