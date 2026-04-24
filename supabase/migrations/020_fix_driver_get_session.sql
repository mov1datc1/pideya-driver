-- ============================================================
-- Migración 020: Fix driver_get_session para incluir campos 
-- requeridos por la app de repartidores.
-- YA EJECUTADA el 2026-04-23 via pooler connection
-- ============================================================

-- Drop existing function (return type changed, can't just CREATE OR REPLACE)
DROP FUNCTION IF EXISTS public.driver_get_session(TEXT);

-- Recrear driver_get_session con los campos faltantes que la app espera:
-- restaurant_lat, restaurant_lng, restaurant_logo
CREATE OR REPLACE FUNCTION public.driver_get_session(
  p_access_token TEXT
)
RETURNS TABLE (
  driver_id UUID,
  restaurant_id UUID,
  user_id UUID,
  restaurant_name TEXT,
  restaurant_phone TEXT,
  restaurant_address TEXT,
  restaurant_lat DOUBLE PRECISION,
  restaurant_lng DOUBLE PRECISION,
  restaurant_logo TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  vehicle_label TEXT,
  push_token TEXT,
  is_active BOOLEAN,
  last_location_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT dp.id,
         dp.restaurant_id,
         dp.user_id,
         r.name,
         r.phone,
         r.address,
         r.lat,
         r.lng,
         r.logo_url,
         dp.name,
         dp.phone,
         dp.vehicle_label,
         dp.push_token,
         dp.is_active,
         dp.last_location_at
  FROM public.driver_profiles dp
  JOIN public.restaurants r ON r.id = dp.restaurant_id
  WHERE dp.access_token = trim(coalesce(p_access_token, ''))
    AND dp.is_active = TRUE
  LIMIT 1;
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.driver_get_session(TEXT) TO anon, authenticated;
