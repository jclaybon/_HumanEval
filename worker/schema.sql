CREATE TABLE IF NOT EXISTS image_metadata (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  verdict TEXT CHECK(verdict IN ('like', 'super_like', 'not_like', 'skip')),
  failure_points TEXT CHECK(failure_points IN ('clear', 'mark', NULL)),
  mask_binary TEXT CHECK(mask_binary IN ('yes', 'no')) DEFAULT 'no',
  masked_areas INTEGER DEFAULT 0,
  mask_data_url TEXT,
  notes TEXT DEFAULT '',
  reviewed_at TEXT,
  batch_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
