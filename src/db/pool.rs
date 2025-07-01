use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::time::Duration;

pub async fn make_pool(db_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(
            sqlx::sqlite::SqliteConnectOptions::new()
                .filename(db_url)
                .create_if_missing(true)
                .pragma("journal_mode", "WAL")
                .pragma("foreign_keys", "ON"),
        )
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
