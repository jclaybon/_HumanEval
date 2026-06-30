-- Add style_reference_r2_key to image_metadata
-- Stores the R2 key of the original training dataset image used as the style reference
-- for style_faithfulness evaluations. Populate via UPDATE after uploading reference images to R2.
ALTER TABLE image_metadata ADD COLUMN style_reference_r2_key TEXT;
