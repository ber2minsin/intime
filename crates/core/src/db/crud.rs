use crate::{
    db::models::{Screenshot, WindowEvent},
    tracker::events::WindowEventType,
};

use super::models::App;
use anyhow::Result;

pub async fn get_saved_app(db_pool: &sqlx::SqlitePool, name: &str) -> Option<App> {
    sqlx::query_as!(
        App,
        "SELECT id, name, path, icon FROM app WHERE name = ?",
        name,
    )
    .fetch_optional(db_pool)
    .await
    .ok()
    .flatten()
}

pub async fn create_app(db_pool: &sqlx::SqlitePool, app: &App) -> Result<(), sqlx::Error> {
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

pub async fn create_window_event(
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

pub async fn create_window_event_with_timestamp(
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    app_id: i64,
    title: String,
    event: WindowEventType,
    timestamp_sec: i64,
) -> Result<(), sqlx::Error> {
    let event_type_str = format!("{:?}", event);
    sqlx::query!(
        "INSERT INTO window_event (app_id, window_title, event_type, created_at) VALUES (?, ?, ?, datetime(?, 'unixepoch'))",
        app_id,
        title,
        event_type_str,
        timestamp_sec
    )
    .execute(db_pool)
    .await?;
    Ok(())
}

pub async fn create_screenshot(
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

pub async fn get_window_events_secs(
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    start_sec: i64,
    end_sec: i64,
    limit: i64,
) -> Result<Vec<WindowEvent>> {
    let rows = sqlx::query!(
        r#"
        SELECT we.app_id as app_id,
               a.name as app_name,
               we.window_title as window_title,
               we.event_type as event_type,
         CAST(strftime('%s', we.created_at) AS INTEGER) as "created_at_sec!: i64"
        FROM window_event we
        JOIN app a ON a.id = we.app_id
     WHERE we.created_at BETWEEN datetime(?1, 'unixepoch') AND datetime(?2, 'unixepoch')
        ORDER BY we.created_at ASC
        LIMIT ?
        "#,
        start_sec,
        end_sec,
        limit
    )
    .fetch_all(db_pool)
    .await?;

    let items = rows
        .into_iter()
        .map(|r| WindowEvent {
            app_id: r.app_id,
            app_name: r.app_name,
            window_title: r.window_title,
            event_type: r.event_type,
            created_at_sec: r.created_at_sec,
        })
        .collect();
    Ok(items)
}

pub async fn get_nearest_screenshot(
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    ts_sec: i64,
    app_id: Option<i64>,
) -> Result<Option<Screenshot>> {
    // Two indexed queries (>= ts and < ts), then pick the closer in Rust to avoid functions on the column.
    let newer_row = sqlx::query!(
        r#"
        SELECT id as "id!: i64",
               app_id as "app_id!: i64",
               screenshot as "png: Vec<u8>",
               CAST(strftime('%s', created_at) AS INTEGER) as "created_at_sec!: i64"
        FROM screenshot
        WHERE (?1 IS NULL OR app_id = ?1)
          AND created_at >= datetime(?2, 'unixepoch')
        ORDER BY created_at ASC
        LIMIT 1
        "#,
        app_id,
        ts_sec
    )
    .fetch_optional(db_pool)
    .await?;

    let newer: Option<Screenshot> = newer_row.map(|r| Screenshot {
        id: r.id,
        app_id: r.app_id,
        created_at_sec: r.created_at_sec,
        png: r.png,
    });

    let older_row = sqlx::query!(
        r#"
        SELECT id as "id!: i64",
               app_id as "app_id!: i64",
               screenshot as "png: Vec<u8>",
               CAST(strftime('%s', created_at) AS INTEGER) as "created_at_sec!: i64"
        FROM screenshot
        WHERE (?1 IS NULL OR app_id = ?1)
          AND created_at < datetime(?2, 'unixepoch')
        ORDER BY created_at DESC
        LIMIT 1
        "#,
        app_id,
        ts_sec
    )
    .fetch_optional(db_pool)
    .await?;

    let older: Option<Screenshot> = older_row.map(|r| Screenshot {
        id: r.id,
        app_id: r.app_id,
        created_at_sec: r.created_at_sec,
        png: r.png,
    });

    let pick = match (older, newer) {
        (None, None) => None,
        (Some(o), None) => Some(o),
        (None, Some(n)) => Some(n),
        (Some(o), Some(n)) => {
            let doff = (ts_sec - o.created_at_sec).abs();
            let noff = (n.created_at_sec - ts_sec).abs();
            if doff <= noff { Some(o) } else { Some(n) }
        }
    };

    Ok(pick.map(|r| Screenshot {
        id: r.id,
        app_id: r.app_id,
        created_at_sec: r.created_at_sec,
        png: r.png,
    }))
}
