-- ============================================================
--  Run once in Supabase SQL Editor.
--  Lets a customer cancel their own order using their lookup code,
--  as long as it's still pending — mirrors the existing
--  get_order_by_code(p_code) RPC's security model.
--
--  Runs as SECURITY DEFINER so the anon role can update exactly the
--  one row matching the code, without needing broad UPDATE
--  permission on the orders table (which anon should NOT have).
-- ============================================================

-- Allow the new 'cancelled' value through the existing status check
-- constraint (confirmed present on this project as orders_status_check).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'ready', 'done', 'cancelled'));

CREATE OR REPLACE FUNCTION cancel_order_by_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE orders
  SET status = 'cancelled'
  WHERE lookup_code = upper(trim(p_code))
    AND status = 'pending';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_order_by_code(text) TO anon, authenticated;
