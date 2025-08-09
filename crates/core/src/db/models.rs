use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, FromRow)]
pub struct DBApp {
    pub id: Option<i64>,
    pub name: String,
    pub path: String,
    pub icon: Option<Vec<u8>>,
}

#[derive(Debug, Serialize)]
pub struct WindowEventRow {
    pub app_id: i64,
    pub app_name: String,
    pub window_title: String,
    pub event_type: String,
    pub created_at_sec: i64,
}

#[derive(Debug, Serialize)]
pub struct ScreenshotBlob {
    pub id: i64,
    pub app_id: i64,
    pub created_at_sec: i64,
    pub png: Vec<u8>,
}
