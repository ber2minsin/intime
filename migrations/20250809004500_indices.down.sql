-- Drop indices (safe to ignore if they don't exist)
DROP INDEX IF EXISTS idx_window_event_created_at;
DROP INDEX IF EXISTS idx_window_event_app_id_created_at;
DROP INDEX IF EXISTS idx_screenshot_created_at;
DROP INDEX IF EXISTS idx_screenshot_app_id_created_at;
