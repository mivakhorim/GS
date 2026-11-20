CREATE TABLE IF NOT EXISTS gateway_links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'standby',
  priority INTEGER DEFAULT 1,
  error_count INTEGER DEFAULT 0,
  last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint_id TEXT,
  action TEXT,
  status_code INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO gateway_links (id, name, type, url, status, priority)
VALUES 
  ('primary_mprx', 'BHUMI MapProxy Official', 'upstream_mprx', 'https://bhumi.atrbpn.go.id/mprx/service', 'standby', 1),
  ('secondary_bhumigs', 'BHUMI GeoServer Umum', 'upstream_wms', 'https://bhumi.atrbpn.go.id/bhumigs/umum', 'standby', 2),
  ('active_tunnel', 'Dynamic Air-Gap Tunnel / Stream', 'tunnel', 'http://127.0.0.1:3000', 'active', 3);
