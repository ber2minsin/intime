-- This will  track all the applications
CREATE TABLE app (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    icon BLOB,
    UNIQUE(name, path) -- FIXME problem might occur if the path changes, i.e 
                       -- the app is moved to a different location
);

CREATE TABLE window_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL REFERENCES app(id) ON DELETE RESTRICT,
    window_title TEXT NOT NULL,
    event_type TEXT NOT NULL, -- we might perhaps add a check here
    occured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(app_id, window_title, event_type, occured_at) -- We ensure this in backend as well, but this is a safety net
);
