-- ============================================================
--  Run once in Supabase SQL Editor to close two race conditions and
--  add a server-side backstop for free-text length limits:
--  1. Duplicate order lookup codes
--  2. The 50-active-order batch cap being exceeded by simultaneous orders
--  3. Oversized order notes / review comments (the HTML maxlength can be
--     bypassed by anyone calling the API directly)
--  All changes are additive and safe to run on a live database.
-- ============================================================

-- 1. Guarantee order codes are unique at the database level.
--    (main.js already retries with a fresh code if this constraint rejects an insert.)
ALTER TABLE orders ADD CONSTRAINT orders_lookup_code_unique UNIQUE (lookup_code);

-- 2. Enforce the 50-active-order cap atomically, so two orders placed at
--    the exact same moment can't both slip in over the limit.
--    An advisory lock serializes the check-and-insert instead of letting
--    concurrent transactions race each other.
CREATE OR REPLACE FUNCTION enforce_order_cap() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('orders_cap_lock'));
  IF (SELECT count(*) FROM orders WHERE status IN ('pending', 'confirmed', 'ready')) >= 50 THEN
    RAISE EXCEPTION 'order_cap_reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_cap_check ON orders;
CREATE TRIGGER orders_cap_check
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_order_cap();

-- 3. Match the HTML maxlength limits at the database level
--    (main.js / index.html cap these at 300 / 500 chars in the UI already).
ALTER TABLE orders  ADD CONSTRAINT orders_note_length     CHECK (char_length(note) <= 300);
ALTER TABLE reviews ADD CONSTRAINT reviews_comment_length CHECK (char_length(comment) <= 500);
