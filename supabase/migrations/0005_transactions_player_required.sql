-- Every transaction row must name a player (or a draft pick), otherwise
-- re-running the sync can't tell rows apart and would add them again.
delete from transactions where player_id is null;
delete from transactions where type = 'trade' or from_franchise_id is not null
   or fantrax_set_id in (select fantrax_set_id from transactions where type = 'trade');
alter table transactions alter column player_id set not null;
