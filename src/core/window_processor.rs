use crate::core::events::{WindowEvent, WindowForegroundEvent};
use crate::db::crud::{get_saved_app, save_app, update_app_path};
use crate::db::models::DBApp;
use crate::tracker;
use sqlx::SqlitePool;
use std::sync::mpsc::{self, Receiver, Sender};
use tokio::time::Duration;
use windows::Win32::UI::WindowsAndMessaging::{DispatchMessageW, GetMessageW, TranslateMessage};

pub struct WindowEventProcessor {
    db_pool: SqlitePool,
}

impl WindowEventProcessor {
    pub fn new(db_pool: SqlitePool) -> Self {
        Self { db_pool }
    }

    pub fn start(&self) {
        let (msg_sender, msg_receiver) = mpsc::channel::<Box<dyn WindowEvent + Send>>();
        let db_pool = self.db_pool.clone();
        let processor = WindowEventProcessor { db_pool };

        let _hook_thread = tokio::task::spawn_blocking(move || {
            Self::run_message_loop(msg_sender);
        });

        tokio::spawn(async move {
            processor.process_events(msg_receiver).await;
        });
    }

    fn run_message_loop(msg_sender: Sender<Box<dyn WindowEvent + Send>>) {
        let hook =
            tracker::set_win_event_hook(msg_sender).expect("Failed to set Windows event hook");
        assert!(!hook.is_invalid(), "Windows event hook is invalid");

        println!("Windows event hook set successfully");

        // Run the Windows message loop
        unsafe {
            let mut msg = std::mem::zeroed();
            while GetMessageW(&mut msg, None, 0, 0).into() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }

    pub async fn process_events(&self, msg_receiver: Receiver<Box<dyn WindowEvent + Send>>) {
        loop {
            match msg_receiver.try_recv() {
                Ok(window_event) => self.handle_window_event(window_event).await,
                Err(_) => {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
            }
        }
    }

    async fn handle_window_event(&self, window_event: Box<dyn WindowEvent + Send>) {
        if let Some(foreground_event) = window_event
            .as_any()
            .downcast_ref::<WindowForegroundEvent>()
        {
            self.handle_foreground_event(foreground_event).await;
        }
        // Handle others
        else {
            eprintln!("Received unsupported window event type");
        }
    }

    async fn handle_foreground_event(&self, event: &WindowForegroundEvent) {
        match self.find_or_create_app(event).await {
            Ok(app) => {
                println!(
                    "App in database: ID: {:?}, Name: {}, Path: {}",
                    app.id, app.name, app.path
                );
            }
            Err(e) => {
                eprintln!("Error processing foreground event: {}", e);
            }
        }
    }

    async fn find_or_create_app(
        &self,
        event: &WindowForegroundEvent,
    ) -> Result<DBApp, Box<dyn std::error::Error>> {
        if let Some(app) = get_saved_app(&self.db_pool, &event.name).await {
            if app.path != event.path {
                // Update the app path if it has changed
                println!(
                    "Updating app path: Name: {}, Old Path: {}, New Path: {}",
                    event.name, app.path, event.path
                );

                let updated_app = DBApp {
                    id: app.id,
                    name: app.name.clone(),
                    path: event.path.clone(),
                    icon: app.icon.clone(),
                };

                update_app_path(&self.db_pool, &event.name, &event.path).await?;

                return Ok(updated_app);
            }
            return Ok(app);
        }

        // App not found, create new one
        println!(
            "Creating new app: Name: {}, Path: {}",
            event.name, event.path
        );

        let app = DBApp {
            id: None,
            name: event.name.clone(),
            path: event.path.clone(),
            icon: None,
        };

        save_app(&self.db_pool, &app).await?;

        // Get the saved app with ID
        let saved_app = get_saved_app(&self.db_pool, &event.name)
            .await
            .ok_or("Failed to retrieve saved app")?;

        Ok(saved_app)
    }
}
