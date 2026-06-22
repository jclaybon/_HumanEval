CREATE TABLE IF NOT EXISTS model_metadata (
  model_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  model_trained_steps INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS image_metadata (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_from_prompt TEXT,
  model_id TEXT REFERENCES model_metadata(model_id),
  has_person INTEGER DEFAULT 0 CHECK(has_person IN (0, 1)),
  style_name TEXT,
  style_description_keyword TEXT,
  r2_key TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eval_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT NOT NULL REFERENCES image_metadata(id),
  eval_type TEXT NOT NULL CHECK(eval_type IN ('prompt_faithfulness', 'style_faithfulness', 'monk_skin_tone', 'overall_vibe_check')),
  verdict TEXT CHECK(verdict IN ('like', 'super_like', 'not_like', 'skip')),
  failure_points TEXT CHECK(failure_points IN ('clear', 'mark', NULL)),
  mask_binary TEXT CHECK(mask_binary IN ('yes', 'no')) DEFAULT 'no',
  masked_areas INTEGER DEFAULT 0,
  mask_data_url TEXT,
  notes TEXT DEFAULT '',
  batch_name TEXT,
  reviewed_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_logs_image_eval_batch
ON eval_logs (image_id, eval_type, batch_name);
