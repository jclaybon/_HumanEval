-- Rebuild eval_logs to support category-based task reviews while preserving data.
-- Historical mappings:
--   style_checker   -> overall_vibe_check
--   prompt_faithful -> prompt_faithfulness

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS eval_logs_next;

CREATE TABLE eval_logs_next (
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

INSERT INTO eval_logs_next (
  id,
  image_id,
  eval_type,
  verdict,
  failure_points,
  mask_binary,
  masked_areas,
  mask_data_url,
  notes,
  batch_name,
  reviewed_at
)
SELECT
  id,
  image_id,
  CASE
    WHEN eval_type = 'style_checker' THEN 'overall_vibe_check'
    WHEN eval_type = 'prompt_faithful' THEN 'prompt_faithfulness'
    ELSE eval_type
  END AS eval_type,
  verdict,
  failure_points,
  mask_binary,
  masked_areas,
  mask_data_url,
  notes,
  batch_name,
  reviewed_at
FROM eval_logs;

DROP TABLE eval_logs;
ALTER TABLE eval_logs_next RENAME TO eval_logs;

DELETE FROM eval_logs
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY image_id, eval_type, batch_name
        ORDER BY reviewed_at DESC, id DESC
      ) AS row_num
    FROM eval_logs
    WHERE batch_name IS NOT NULL
  ) dedupe
  WHERE row_num > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_logs_image_eval_batch
ON eval_logs (image_id, eval_type, batch_name);

PRAGMA foreign_keys = ON;
