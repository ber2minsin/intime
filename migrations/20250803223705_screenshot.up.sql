CREATE TABLE screenshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL REFERENCES app(id) ON DELETE RESTRICT,
    screenshot BLOB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(app_id, window_title, created_at) 
)
