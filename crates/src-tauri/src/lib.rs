use image::ImageFormat;
use intime_core::{
    self as core, db::models::Screenshot, tracker::events::WindowEventType,
    tracker::window_processor::WindowEventProcessor,
};
use sqlx::SqlitePool;
use std::io::Cursor;
use tauri::{Manager as _, WindowEvent};

struct AppState {
    pool: SqlitePool,
}

// Helper function to get or create a system app for application-level events
async fn get_or_create_system_app(pool: &SqlitePool) -> i64 {
    // Try to get existing system app
    if let Some(app) = core::db::crud::get_saved_app(pool, "System").await {
        return app.id.unwrap_or(1);
    }

    // Create system app if it doesn't exist
    let system_app = core::db::models::App {
        id: None,
        name: "System".to_string(),
        path: "system://application".to_string(),
        icon: None,
    };

    if let Ok(_) = core::db::crud::create_app(pool, &system_app).await {
        if let Some(created_app) = core::db::crud::get_saved_app(pool, "System").await {
            return created_app.id.unwrap_or(1);
        }
    }

    // Fallback: return 1 (this assumes there's at least one app in the database)
    1
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
            let config = core::config::Config::load().unwrap_or_default();
            let db_url = config.database_url;
            let pool = tauri::async_runtime::block_on(SqlitePool::connect(&db_url))?;
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
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { .. } => {
                    // Handle close requested event - insert a Close window event
                    let app_handle = window.app_handle();
                    if let Some(app_state) = app_handle.try_state::<AppState>() {
                        let pool = app_state.pool.clone();

                        tauri::async_runtime::spawn(async move {
                            // Create a "Close" window event to mark the end of the session
                            // I want to refactor this later somehow.
                            let close_event = WindowEventType::new(99999);

                            // Get the most recent app_id, or create a system app as fallback
                            let app_id = get_or_create_system_app(&pool).await;
                            let result = core::db::crud::create_window_event(
                                &pool,
                                app_id,
                                "Application Closing".to_string(),
                                close_event,
                            )
                            .await;

                            if let Err(e) = result {
                                eprintln!("Failed to create close window event: {}", e);
                            } else {
                                println!("Close window event created successfully");
                            }
                        });
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            fetch_window_events,
            get_nearest_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
