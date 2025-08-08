use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::{str::FromStr, time::Duration};

pub async fn create_pool(db_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(
            sqlx::sqlite::SqliteConnectOptions::from_str(db_url)?
                .foreign_keys(true)
                .create_if_missing(true)
                .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal),
        )
        .await?;
    sqlx::migrate!("../../migrations").run(&pool).await?;
    Ok(pool)
}
