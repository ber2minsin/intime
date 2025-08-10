use intime_core::{self as core, tracker::window_processor::WindowEventProcessor};
use sqlx::SqlitePool;
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
) -> Result<Vec<core::db::models::WindowEventRow>, String> {
    let start_sec = start_ms / 1000;
    let end_sec = end_ms / 1000;
    core::db::crud::get_window_events_secs(&state.pool, start_sec, end_sec, limit.unwrap_or(2000))
        .await
        .map_err(|e| e.to_string())
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
        .invoke_handler(tauri::generate_handler![fetch_window_events])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
