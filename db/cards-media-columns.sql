-- Adds the media column used by Kioku Storage-backed audio.
-- Run ONCE in the Supabase SQL editor. Safe to run more than once.
--
-- audio_path holds the Storage object path of a card's primary audio (mp3),
-- e.g. "{user_id}/{deck_id}/{card_id}.mp3". NULL means the card has no
-- generated/attached audio (backward compatible with existing cards).

alter table public.cards
  add column if not exists audio_path text;
