-- No-claims removal: cards are agnostic — anyone pays, anyone boosts; there
-- is no ownership notion. Drops the claims table introduced in
-- 20250824000001_accounts.sql (its row-level security, policies and grants
-- vanish with the table — nothing else references it).
drop table if exists claims;
