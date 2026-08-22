-- Realtime: broadcast board + activity changes to every visitor
alter publication supabase_realtime add table listings;
alter publication supabase_realtime add table activity;
