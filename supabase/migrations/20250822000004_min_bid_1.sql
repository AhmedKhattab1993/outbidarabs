-- Minimum bid: $5 → $1 (product decision 2026-08-22). Existing rows are all ≥ 5,
-- so the constraint swap is safe.
alter table listings drop constraint if exists listings_bid_amount_check;
alter table listings add constraint listings_bid_amount_check
  check (bid_amount between 1 and 999999);
