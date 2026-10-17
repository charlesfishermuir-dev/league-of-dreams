-- Who won the matchup. Usually the side with more category wins, but tied
-- playoff matchups were decided by a tiebreaker. Null = genuine tie.
alter table matchups add column winner_id int references franchises(id);
