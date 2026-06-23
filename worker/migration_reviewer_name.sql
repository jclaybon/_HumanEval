-- Add reviewer_name to eval_logs so results are tied to the person who reviewed them.
-- Recreate the unique index to allow multiple reviewers per image/eval_type/batch.

ALTER TABLE eval_logs ADD COLUMN reviewer_name TEXT;

DROP INDEX IF EXISTS idx_eval_logs_image_eval_batch;

CREATE UNIQUE INDEX idx_eval_logs_image_eval_batch
ON eval_logs (image_id, eval_type, batch_name, reviewer_name);
