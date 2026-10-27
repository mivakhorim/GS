-- Duta Digital Agensi (dutamik.id) : Duta Media Informasi berKarya : Sukoharjo, Jawa Tengah
-- Master Skrip Migrasi & Cadangan Basis Data Supabase / PostgreSQL
-- Digunakan untuk setup awal atau migrasi ke database server baru.

-- 1. TABEL MASTER ROLES & SEEDING DATA
CREATE TABLE IF NOT EXISTS public.roles (
  role_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  max_area_m2 NUMERIC NOT NULL DEFAULT 150,
  can_export_shp BOOLEAN NOT NULL DEFAULT false,
  can_use_server2 BOOLEAN NOT NULL DEFAULT false,
  can_manage_roles BOOLEAN NOT NULL DEFAULT false,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.roles (role_id, display_name, description, max_area_m2, can_export_shp, can_use_server2, can_manage_roles, is_system_role)
VALUES
  ('free', 'Member Gratis', 'Akses standar batas luas 150 m2 format geospasi.zip', 150, false, false, false, true),
  ('pro', 'Member PRO Lifetime', 'Akses penuh tanpa batas luas dan ekspor kustom SHP CAD GeoJSON', 0, true, false, false, true),
  ('admin', 'Administrator', 'Hak kendali penuh sistem Server 2 dan manajemen role pengguna', 0, true, true, true, true)
ON CONFLICT (role_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  max_area_m2 = EXCLUDED.max_area_m2,
  can_export_shp = EXCLUDED.can_export_shp,
  can_use_server2 = EXCLUDED.can_use_server2,
  can_manage_roles = EXCLUDED.can_manage_roles,
  is_system_role = EXCLUDED.is_system_role,
  updated_at = NOW();

-- 2. TABEL MEMBERS & RELASI ROLE
CREATE TABLE IF NOT EXISTS public.members (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired', 'blocked')),
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' AND table_name = 'members' AND constraint_name = 'fk_members_role'
  ) THEN
    ALTER TABLE public.members 
      ADD CONSTRAINT fk_members_role 
      FOREIGN KEY (role) REFERENCES public.roles(role_id) 
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- 3. TABEL PAYMENTS & INVOICE QRIS
CREATE TABLE IF NOT EXISTS public.payments (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT DEFAULT 'pro_annual',
  base_amount NUMERIC DEFAULT 75000,
  unique_code INT,
  total_amount NUMERIC DEFAULT 75000,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. KUMPULAN STORED PROCEDURE (RPC) KEAMANAN
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_email TEXT;
  v_role TEXT;
  v_status TEXT;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL OR v_email = '' THEN
    RETURN FALSE;
  END IF;

  SELECT role, status INTO v_role, v_status
  FROM public.members
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_email));

  RETURN (LOWER(TRIM(v_role)) = 'admin' AND (LOWER(TRIM(v_status)) IN ('active', 'aktif') OR v_status IS NULL));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_manage_roles()
RETURNS BOOLEAN AS $$
DECLARE
  v_email TEXT;
  v_can_manage BOOLEAN;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL OR v_email = '' THEN
    RETURN FALSE;
  END IF;

  SELECT r.can_manage_roles INTO v_can_manage
  FROM public.members m
  JOIN public.roles r ON LOWER(TRIM(m.role)) = LOWER(TRIM(r.role_id))
  WHERE LOWER(TRIM(m.email)) = LOWER(TRIM(v_email)) AND (LOWER(TRIM(m.status)) IN ('active', 'aktif') OR m.status IS NULL);

  RETURN COALESCE(v_can_manage, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_member_profile()
RETURNS JSON AS $$
DECLARE
  v_email TEXT;
  v_member RECORD;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL OR v_email = '' THEN
    RETURN json_build_object('found', false, 'role', 'free', 'status', 'none');
  END IF;

  SELECT m.email, m.role, m.status, m.expires_at, m.full_name
  INTO v_member
  FROM public.members m
  WHERE LOWER(TRIM(m.email)) = LOWER(TRIM(v_email));

  IF NOT FOUND THEN
    RETURN json_build_object(
      'found', false,
      'email', LOWER(TRIM(v_email)),
      'role', 'free',
      'status', 'active'
    );
  END IF;

  RETURN json_build_object(
    'found', true,
    'email', v_member.email,
    'role', LOWER(TRIM(v_member.role)),
    'status', LOWER(TRIM(COALESCE(v_member.status, 'active'))),
    'expires_at', v_member.expires_at,
    'full_name', v_member.full_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_roles_list()
RETURNS TABLE (
  role_id TEXT,
  display_name TEXT,
  description TEXT,
  max_area_m2 NUMERIC,
  can_export_shp BOOLEAN,
  can_use_server2 BOOLEAN,
  can_manage_roles BOOLEAN,
  is_system_role BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.role_id,
    r.display_name,
    r.description,
    r.max_area_m2,
    r.can_export_shp,
    r.can_use_server2,
    r.can_manage_roles,
    r.is_system_role
  FROM public.roles r
  ORDER BY r.is_system_role DESC, r.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.set_member_role(
  p_email TEXT,
  p_role TEXT,
  p_duration_days INT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_admin_email TEXT;
  v_target_email TEXT;
  v_target_role TEXT;
  v_expires_at TIMESTAMPTZ := NULL;
  v_role_exists BOOLEAN;
BEGIN
  IF NOT public.can_manage_roles() AND current_user != 'service_role' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya administrator resmi yang berhak mengubah role member.';
  END IF;

  v_admin_email := COALESCE(auth.jwt() ->> 'email', 'service_role');
  v_target_email := LOWER(TRIM(p_email));
  v_target_role := LOWER(TRIM(p_role));

  IF v_target_email IS NULL OR v_target_email = '' OR v_target_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Alamat email pengguna tidak valid: %', p_email;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.roles WHERE role_id = v_target_role) INTO v_role_exists;
  IF NOT v_role_exists THEN
    RAISE EXCEPTION 'Role % tidak ditemukan dalam master roles sistem.', v_target_role;
  END IF;

  IF p_duration_days IS NOT NULL AND p_duration_days > 0 THEN
    v_expires_at := NOW() + (p_duration_days || ' days')::INTERVAL;
  ELSE
    v_expires_at := NULL;
  END IF;

  INSERT INTO public.members (email, role, status, expires_at, assigned_by, assigned_at, updated_at)
  VALUES (v_target_email, v_target_role, 'active', v_expires_at, v_admin_email, NOW(), NOW())
  ON CONFLICT (email) DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    expires_at = EXCLUDED.expires_at,
    assigned_by = EXCLUDED.assigned_by,
    assigned_at = EXCLUDED.assigned_at,
    updated_at = NOW();

  RETURN json_build_object(
    'success', true,
    'email', v_target_email,
    'role', v_target_role,
    'status', 'active',
    'expires_at', v_expires_at,
    'assigned_by', v_admin_email,
    'assigned_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.add_or_update_role(
  p_role_id TEXT,
  p_display_name TEXT,
  p_description TEXT DEFAULT '',
  p_max_area_m2 NUMERIC DEFAULT 0,
  p_can_export_shp BOOLEAN DEFAULT true,
  p_can_use_server2 BOOLEAN DEFAULT false,
  p_can_manage_roles BOOLEAN DEFAULT false
)
RETURNS JSON AS $$
DECLARE
  v_cleaned_id TEXT;
  v_is_system BOOLEAN := false;
BEGIN
  IF NOT public.can_manage_roles() AND current_user != 'service_role' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang dapat menambahkan atau mengubah data role.';
  END IF;

  v_cleaned_id := LOWER(REGEXP_REPLACE(TRIM(p_role_id), '[^a-zA-Z0-9_]', '', 'g'));
  IF v_cleaned_id IS NULL OR v_cleaned_id = '' THEN
    RAISE EXCEPTION 'Format identitas role (role_id) tidak valid.';
  END IF;

  SELECT is_system_role INTO v_is_system FROM public.roles WHERE role_id = v_cleaned_id;
  IF v_is_system IS TRUE THEN
    IF v_cleaned_id = 'admin' AND p_can_manage_roles IS FALSE THEN
      RAISE EXCEPTION 'Role admin sistem wajib memiliki hak kelola role (can_manage_roles).';
    END IF;
  END IF;

  INSERT INTO public.roles (
    role_id, display_name, description, max_area_m2, 
    can_export_shp, can_use_server2, can_manage_roles, is_system_role, updated_at
  )
  VALUES (
    v_cleaned_id, TRIM(p_display_name), TRIM(p_description), GREATEST(0, p_max_area_m2),
    p_can_export_shp, p_can_use_server2, p_can_manage_roles, COALESCE(v_is_system, false), NOW()
  )
  ON CONFLICT (role_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    max_area_m2 = EXCLUDED.max_area_m2,
    can_export_shp = EXCLUDED.can_export_shp,
    can_use_server2 = EXCLUDED.can_use_server2,
    can_manage_roles = CASE WHEN public.roles.is_system_role AND public.roles.role_id = 'admin' THEN true ELSE EXCLUDED.can_manage_roles END,
    updated_at = NOW();

  RETURN json_build_object(
    'success', true,
    'role_id', v_cleaned_id,
    'display_name', p_display_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.delete_custom_role(
  p_role_id TEXT
)
RETURNS JSON AS $$
DECLARE
  v_role_id TEXT;
  v_is_system BOOLEAN;
  v_member_count INT;
BEGIN
  IF NOT public.can_manage_roles() AND current_user != 'service_role' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang berhak menghapus role.';
  END IF;

  v_role_id := LOWER(TRIM(p_role_id));
  SELECT is_system_role INTO v_is_system FROM public.roles WHERE role_id = v_role_id;

  IF v_is_system IS NULL THEN
    RAISE EXCEPTION 'Role % tidak ditemukan.', v_role_id;
  END IF;

  IF v_is_system IS TRUE THEN
    RAISE EXCEPTION 'Role bawaan sistem (%) tidak dapat dihapus.', v_role_id;
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM public.members WHERE role = v_role_id;
  IF v_member_count > 0 THEN
    RAISE EXCEPTION 'Role % masih aktif digunakan oleh % member. Alihkan role member terlebih dahulu sebelum menghapus.', v_role_id, v_member_count;
  END IF;

  DELETE FROM public.roles WHERE role_id = v_role_id;

  RETURN json_build_object(
    'success', true,
    'role_id', v_role_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_members_list_admin(
  p_search TEXT DEFAULT '',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  email TEXT,
  role TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  role_display_name TEXT,
  max_area_m2 NUMERIC,
  can_export_shp BOOLEAN,
  can_use_server2 BOOLEAN
) AS $$
BEGIN
  IF NOT public.can_manage_roles() AND current_user != 'service_role' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang dapat melihat daftar seluruh member.';
  END IF;

  RETURN QUERY
  SELECT 
    m.email,
    m.role,
    m.status,
    m.expires_at,
    m.assigned_by,
    m.assigned_at,
    m.created_at,
    r.display_name AS role_display_name,
    r.max_area_m2,
    r.can_export_shp,
    r.can_use_server2
  FROM public.members m
  LEFT JOIN public.roles r ON m.role = r.role_id
  WHERE (p_search = '' OR m.email ILIKE ('%' || p_search || '%') OR m.role ILIKE ('%' || p_search || '%'))
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.create_pending_payment(
  p_plan text DEFAULT 'pro_annual',
  p_base_amount numeric DEFAULT 75000
)
RETURNS json AS $$
DECLARE
  v_user_email text;
  v_unique_code int;
  v_total_amount numeric;
  v_payment_id bigint;
  v_attempts int := 0;
BEGIN
  v_user_email := auth.jwt() ->> 'email';
  IF v_user_email IS NULL OR v_user_email = '' THEN
    RAISE EXCEPTION 'Autentikasi diperlukan. Pengguna wajib login terlebih dahulu.';
  END IF;

  SELECT id, unique_code, total_amount INTO v_payment_id, v_unique_code, v_total_amount
  FROM public.payments
  WHERE email = v_user_email AND status = 'pending' AND created_at > (NOW() - INTERVAL '24 hours')
  ORDER BY created_at DESC LIMIT 1;

  IF v_payment_id IS NOT NULL THEN
    RETURN json_build_object(
      'id', v_payment_id,
      'email', v_user_email,
      'plan', p_plan,
      'base_amount', p_base_amount,
      'unique_code', v_unique_code,
      'total_amount', v_total_amount,
      'status', 'pending',
      'is_existing', true
    );
  END IF;

  LOOP
    v_unique_code := 100 + floor(random() * 899)::int;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.payments
      WHERE unique_code = v_unique_code AND status = 'pending' AND created_at > (NOW() - INTERVAL '24 hours')
    ) OR v_attempts > 60;
    v_attempts := v_attempts + 1;
  END LOOP;

  v_total_amount := p_base_amount + v_unique_code;

  INSERT INTO public.payments (email, plan, base_amount, unique_code, total_amount, status, created_at)
  VALUES (v_user_email, p_plan, p_base_amount, v_unique_code, v_total_amount, 'pending', NOW())
  RETURNING id INTO v_payment_id;

  RETURN json_build_object(
    'id', v_payment_id,
    'email', v_user_email,
    'plan', p_plan,
    'base_amount', p_base_amount,
    'unique_code', v_unique_code,
    'total_amount', v_total_amount,
    'status', 'pending',
    'is_existing', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. TRIGGER DATABASE & PENGUNCIAN ROW LEVEL SECURITY (RLS)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_initial_role TEXT := 'free';
BEGIN
  IF LOWER(NEW.email) IN ('admin@dutamik.id', 'duta.digital.agensi@gmail.com') THEN
    v_initial_role := 'admin';
  END IF;

  INSERT INTO public.members (email, role, status, created_at, updated_at)
  VALUES (LOWER(TRIM(NEW.email)), v_initial_role, 'active', NOW(), NOW())
  ON CONFLICT (email) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.protect_member_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF (current_user = 'service_role' OR auth.role() = 'service_role') THEN
    RETURN NEW;
  END IF;

  IF public.can_manage_roles() THEN
    RETURN NEW;
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status OR NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya administrator resmi yang berhak mengubah hak akses role member.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_member_role_escalation ON public.members;
CREATE TRIGGER trg_protect_member_role_escalation
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_member_role_escalation();

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.roles FROM anon, public;
REVOKE ALL ON TABLE public.members FROM anon, public;
REVOKE ALL ON TABLE public.payments FROM anon, public;

GRANT SELECT ON TABLE public.roles TO authenticated;
GRANT ALL ON TABLE public.roles TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.members TO authenticated;
GRANT ALL ON TABLE public.members TO service_role;

GRANT SELECT, INSERT, DELETE ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;

DROP POLICY IF EXISTS "roles_read_authenticated" ON public.roles;
CREATE POLICY "roles_read_authenticated" ON public.roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "roles_service_role_all" ON public.roles;
CREATE POLICY "roles_service_role_all" ON public.roles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "members_select_own" ON public.members;
CREATE POLICY "members_select_own" ON public.members FOR SELECT TO authenticated USING (LOWER(TRIM(auth.jwt() ->> 'email')) = LOWER(TRIM(email)));

DROP POLICY IF EXISTS "members_insert_free_only" ON public.members;
CREATE POLICY "members_insert_free_only" ON public.members FOR INSERT TO authenticated WITH CHECK ((LOWER(TRIM(auth.jwt() ->> 'email')) = LOWER(TRIM(email))) AND (role = 'free' OR role IS NULL));

DROP POLICY IF EXISTS "members_update_restricted" ON public.members;
CREATE POLICY "members_update_restricted" ON public.members FOR UPDATE TO authenticated USING (LOWER(TRIM(auth.jwt() ->> 'email')) = LOWER(TRIM(email))) WITH CHECK ((LOWER(TRIM(auth.jwt() ->> 'email')) = LOWER(TRIM(email))) AND (role = 'free' OR role IS NULL));

DROP POLICY IF EXISTS "members_service_role_all" ON public.members;
CREATE POLICY "members_service_role_all" ON public.members FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_own" ON public.payments FOR SELECT TO authenticated USING (LOWER(TRIM(auth.jwt() ->> 'email')) = LOWER(TRIM(email)));

DROP POLICY IF EXISTS "payments_insert_pending_own" ON public.payments;
CREATE POLICY "payments_insert_pending_own" ON public.payments FOR INSERT TO authenticated WITH CHECK ((LOWER(TRIM(auth.jwt() ->> 'email')) = LOWER(TRIM(email))) AND (status = 'pending'));

DROP POLICY IF EXISTS "payments_delete_pending_own" ON public.payments;
CREATE POLICY "payments_delete_pending_own" ON public.payments FOR DELETE TO authenticated USING ((LOWER(TRIM(auth.jwt() ->> 'email')) = LOWER(TRIM(email))) AND (status = 'pending'));

DROP POLICY IF EXISTS "payments_service_role_all" ON public.payments;
CREATE POLICY "payments_service_role_all" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION public.get_roles_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_roles_list() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_member_role(TEXT, TEXT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_member_role(TEXT, TEXT, INT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.add_or_update_role(TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, BOOLEAN, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_or_update_role(TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_custom_role(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_custom_role(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_members_list_admin(TEXT, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_members_list_admin(TEXT, INT, INT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_pending_payment(text, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_pending_payment(text, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_member_profile() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_member_profile() TO authenticated, service_role;