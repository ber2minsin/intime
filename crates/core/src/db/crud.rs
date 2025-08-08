use crate::tracker::events::WindowEventType;

use super::models::DBApp;
pub async fn get_saved_app(db_pool: &sqlx::SqlitePool, name: &str) -> Option<DBApp> {
    sqlx::query_as!(
        DBApp,
        "SELECT id, name, path, icon FROM app WHERE name = ?",
        name,
    )
    .fetch_optional(db_pool)
    .await
    .ok()
    .flatten()
}

pub async fn save_app(db_pool: &sqlx::SqlitePool, app: &DBApp) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO app (name, path, icon) VALUES (?, ?, ?)",
        app.name,
        app.path,
        app.icon
    )
    .execute(db_pool)
    .await?;
    Ok(())
}

pub async fn update_app_path(
    db_pool: &sqlx::SqlitePool,
    name: &str,
    new_path: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE app SET path = ? WHERE name = ?", new_path, name,)
        .execute(db_pool)
        .await?;
    Ok(())
}

pub async fn register_window_event(
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    app_id: i64,
    title: String,
    event: WindowEventType,
) -> Result<(), sqlx::Error> {
    let event_type_str = format!("{:?}", event);
    sqlx::query!(
        "INSERT INTO window_event (app_id, window_title, event_type) VALUES (?, ?, ?)",
        app_id,
        title,
        event_type_str
    )
    .execute(db_pool)
    .await?;
    Ok(())
}

pub async fn save_screenshot(
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    image: Vec<u8>,
    app_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO screenshot (app_id, screenshot) VALUES (?, ?)",
        app_id,
        image
    )
    .execute(db_pool)
    .await?;
    Ok(())
}
