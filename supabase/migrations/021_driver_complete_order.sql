-- ============================================================
-- Migración 021: RPC para que el repartidor marque como DELIVERED
-- + columna photo_url + columna avatar en driver_profiles
-- EJECUTAR EN SUPABASE SQL EDITOR
-- ============================================================

-- 1. Add delivery_photo_url to orders (if not exists)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_photo_url TEXT;

-- 2. Add avatar_url to driver_profiles (for profile photo)
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. Create RPC for driver to complete delivery (SECURITY DEFINER, no RLS issue)
CREATE OR REPLACE FUNCTION public.driver_complete_order(
  p_access_token TEXT,
  p_order_id UUID,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
  v_order public.orders;
BEGIN
  -- Validate driver token
  SELECT dp.id INTO v_driver_id
  FROM public.driver_profiles dp
  WHERE dp.access_token = trim(coalesce(p_access_token, ''))
    AND dp.is_active = TRUE
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Acceso de repartidor inválido.';
  END IF;

  -- Update order to DELIVERED
  UPDATE public.orders o
  SET status = 'DELIVERED',
      delivered_at = NOW(),
      delivery_photo_url = COALESCE(p_photo_url, o.delivery_photo_url)
  WHERE o.id = p_order_id
    AND o.delivery_driver_id = v_driver_id
    AND o.status = 'ON_THE_WAY'
  RETURNING o.* INTO v_order;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido no disponible para completar.';
  END IF;

  RETURN v_order;
END;
$$;

-- 4. RPC for driver to update their avatar
CREATE OR REPLACE FUNCTION public.driver_update_avatar(
  p_access_token TEXT,
  p_avatar_url TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
BEGIN
  SELECT dp.id INTO v_driver_id
  FROM public.driver_profiles dp
  WHERE dp.access_token = trim(coalesce(p_access_token, ''))
    AND dp.is_active = TRUE
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Acceso de repartidor inválido.';
  END IF;

  UPDATE public.driver_profiles
  SET avatar_url = p_avatar_url
  WHERE id = v_driver_id;
END;
$$;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION public.driver_complete_order(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.driver_update_avatar(TEXT, TEXT) TO anon, authenticated;

-- 6. Create storage bucket for driver avatars (run in Supabase Dashboard if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('driver-avatars', 'driver-avatars', true)
-- ON CONFLICT DO NOTHING;
