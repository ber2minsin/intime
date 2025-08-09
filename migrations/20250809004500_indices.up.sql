-- Indices to speed up time-range and nearest queries
-- for window events and getting screenshots
CREATE INDEX IF NOT EXISTS idx_window_event_created_at ON window_event(created_at);
CREATE INDEX IF NOT EXISTS idx_window_event_app_id_created_at ON window_event(app_id, created_at);

-- for nearest lookup
CREATE INDEX IF NOT EXISTS idx_screenshot_created_at ON screenshot(created_at);
CREATE INDEX IF NOT EXISTS idx_screenshot_app_id_created_at ON screenshot(app_id, created_at);
