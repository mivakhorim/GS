-- Duta Digital Agensi (dutamik.id)
-- Master Security Policy: Akses Kontrol Admin & Row Level Security (RLS) Duta GeoSpasi
-- Jalankan skrip ini pada menu SQL Editor di dashboard Supabase Anda.

-- OPSI 1 (PALING MUDAH & DIREKOMENDASIKAN):
-- Nonaktifkan RLS agar Dashboard Admin dapat mengedit tabel, menambah data baru, dan memblokir akun tanpa hambatan:
ALTER TABLE members DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

-- OPSI 2 (JIKA INGIN RLS TETAP AKTIF DENGAN KEBIJAKAN AKSES PENUH ADMIN):
-- Buka tanda komentar di bawah jika ingin menggunakan RLS dengan kebijakan penuh:
-- ALTER TABLE members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "members_admin_full_access" ON members;
-- CREATE POLICY "members_admin_full_access" ON members FOR ALL TO public USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "payments_admin_full_access" ON payments;
-- CREATE POLICY "payments_admin_full_access" ON payments FOR ALL TO public USING (true) WITH CHECK (true);
