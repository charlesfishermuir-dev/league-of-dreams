-- Trades: the team a player (or draft pick) came from. For trades,
-- franchise_id is the team that received the player.
alter table transactions add column from_franchise_id int references franchises(id);
