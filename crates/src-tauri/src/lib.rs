use image::ImageFormat;
use intime_core::{
    self as core, db::models::Screenshot, tracker::window_processor::WindowEventProcessor,
};
use sqlx::SqlitePool;
use std::io::Cursor;
use tauri::Manager as _;

struct AppState {
    pool: SqlitePool,
}

#[tauri::command]
async fn fetch_window_events(
    state: tauri::State<'_, AppState>,
    start_ms: i64,
    end_ms: i64,
    limit: Option<i64>,
) -> Result<Vec<core::db::models::WindowEvent>, String> {
    let start_sec = start_ms / 1000;
    let end_sec = end_ms / 1000;
    core::db::crud::get_window_events_secs(&state.pool, start_sec, end_sec, limit.unwrap_or(2000))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_nearest_screenshot(
    state: tauri::State<'_, AppState>,
    ts_ms: i64,
    app_id: Option<i64>,
) -> Result<Option<Screenshot>, String> {
    let ts_sec = ts_ms / 1000;
    let res = core::db::crud::get_nearest_screenshot(&state.pool, ts_sec, app_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(res.map(|s| {
        let bytes = s.png;
        let png_sig: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
        let png = if bytes.len() >= 8 && &bytes[..8] == &png_sig {
            // already PNG
            bytes
        } else {
            // try decode and re-encode as PNG
            match image::load_from_memory(&bytes) {
                Ok(img) => {
                    let mut out = Vec::new();
                    let _ = img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png);
                    if out.is_empty() {
                        bytes
                    } else {
                        out
                    }
                }
                Err(_) => bytes,
            }
        };
        Screenshot {
            id: s.id,
            created_at_sec: s.created_at_sec,
            app_id: s.app_id,
            png,
        }
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv::dotenv().ok();

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Create the database pool and manage it as state.
            let database_url = std::env::var("DATABASE_URL").unwrap();
            let pool = tauri::async_runtime::block_on(SqlitePool::connect(&database_url))?;
            app.manage(AppState { pool: pool.clone() });

            // Start window_processor in the background
            tauri::async_runtime::spawn({
                let pool = pool.clone();
                async move {
                    // Your window processing logic here
                    let processor = WindowEventProcessor::new(pool.clone());
                    processor.start();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_window_events,
            get_nearest_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
