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
