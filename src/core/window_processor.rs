use crate::core::events::{WindowEvent, WindowForegroundEvent};
use crate::db::crud::{get_saved_app, register_window_event, save_app, update_app_path};
use crate::db::models::DBApp;
use crate::platform::screenshot::{self, screenshot_window};
use crate::platform::tracker::set_win_event_hook;

use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use tokio::time::{Duration, Instant};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{DispatchMessageW, GetMessageW, TranslateMessage};

use anyhow::Result;

pub struct WindowEventProcessor {
    db_pool: SqlitePool,
    current_foreground_window_hwnd: Option<isize>,
    screenshot_handle: Option<tokio::task::JoinHandle<()>>,
    screenshot_instants: Arc<Mutex<HashMap<isize, Instant>>>,
}

impl WindowEventProcessor {
    pub fn new(db_pool: SqlitePool) -> Self {
        Self {
            db_pool,
            current_foreground_window_hwnd: None,
            screenshot_handle: None,
            screenshot_instants: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn start(&self) {
        let (msg_sender, msg_receiver) = mpsc::channel::<Box<dyn WindowEvent + Send>>();
        let db_pool = self.db_pool.clone();
        let mut processor = WindowEventProcessor::new(db_pool);

        let _hook_thread = tokio::task::spawn_blocking(move || {
            Self::run_message_loop(msg_sender);
        });

        tokio::spawn(async move {
            processor.process_events(msg_receiver).await;
        });
    }

    fn run_message_loop(msg_sender: Sender<Box<dyn WindowEvent + Send>>) {
        let hook = set_win_event_hook(msg_sender).expect("Failed to set Windows event hook");
        assert!(!hook.is_invalid(), "Windows event hook is invalid");

        println!("Windows event hook set successfully");
        unsafe {
            let mut msg = std::mem::zeroed();
            while GetMessageW(&mut msg, None, 0, 0).into() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            println!("Exiting message loop");
        }
    }

    pub async fn process_events(&mut self, msg_receiver: Receiver<Box<dyn WindowEvent + Send>>) {
        loop {
            match msg_receiver.try_recv() {
                Ok(window_event) => self.handle_window_event(window_event).await,
                Err(_) => {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
            }
        }
    }

    async fn handle_window_event(&mut self, window_event: Box<dyn WindowEvent + Send>) {
        if let Some(foreground_event) = window_event
            .as_any()
            .downcast_ref::<WindowForegroundEvent>()
        {
            println!(
                "Received foreground event: Name: {}, Title: {}, Path: {}",
                foreground_event.name, foreground_event.title, foreground_event.path
            );
            self.handle_foreground_event(foreground_event).await;
        }
        // Handle others
        else {
            eprintln!("Received unsupported window event type");
        }
    }

    async fn handle_foreground_event(&mut self, event: &WindowForegroundEvent) {
        match self.find_or_create_app(event).await {
            Ok(app) => {
                println!(
                    "App in database: ID: {:?}, Name: {}, Path: {}",
                    app.id, app.name, app.path
                );

                let _ = register_window_event(
                    &self.db_pool,
                    app.id.unwrap(),
                    event.title.clone(),
                    event.event(),
                )
                .await;
            }
            Err(e) => {
                eprintln!("Error processing foreground event: {}", e);
            }
        }

        if self.current_foreground_window_hwnd != Some(event.hwnd) {
            self.current_foreground_window_hwnd = Some(event.hwnd);

            // Previous screenshot does not need to be run anymore
            if let Some(handle) = self.screenshot_handle.take() {
                handle.abort();
            }
            self.schedule_screenshot(event).await;
        }
    }

    async fn schedule_screenshot(&mut self, event: &WindowForegroundEvent) {
        println!(
            "Scheduling screenshot for app: Name: {}, Path: {}",
            event.name, event.path
        );

        let hwnd_val = event.hwnd;
        let app_name = event.name.clone();
        let screenshot_instants = Arc::clone(&self.screenshot_instants);
        let screenshot_interval = Duration::from_secs(10); // 5 minutes

        let screenshot_task = tokio::task::spawn(async move {
            // TODO get these from config or something else

            loop {
                // This is not that readable so explanation;
                // We are waiting for a global screenshot interval
                // and then taking a screenshot if the interval has passed
                // or else, we are sleeping for the remaining time
                if should_take_screenshot(
                    hwnd_val,
                    screenshot_instants.clone(),
                    screenshot_interval,
                ) {
                    execute_screenshot_on_interval(hwnd_val, app_name.clone()).await;

                    let mut screenshot_instants = screenshot_instants.lock().unwrap();
                    screenshot_instants.insert(hwnd_val, Instant::now());
                } else {
                    tokio::time::sleep(get_remaining_time(
                        hwnd_val,
                        &app_name,
                        &screenshot_instants,
                        screenshot_interval,
                    ))
                    .await;
                }
            }
        });

        self.screenshot_handle = Some(screenshot_task);
    }

    async fn find_or_create_app(&self, event: &WindowForegroundEvent) -> Result<DBApp> {
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
            .ok_or(anyhow::anyhow!(
                "Failed to retrieve saved app after creation"
            ))?;

        Ok(saved_app)
    }
}

fn get_remaining_time(
    hwnd_val: isize,
    app_name: &String,
    screenshot_instants: &Arc<Mutex<HashMap<isize, Instant>>>,
    screenshot_interval: Duration,
) -> Duration {
    let screenshots = screenshot_instants.lock().unwrap();
    if let Some(last_time) = screenshots.get(&hwnd_val) {
        let remaining = screenshot_interval.saturating_sub(last_time.elapsed());
        println!(
            "Skipping screenshot for {} - last taken {:?} ago, next in {:?}",
            app_name,
            last_time.elapsed(),
            remaining
        );
        remaining
    } else {
        screenshot_interval
    }
}

fn should_take_screenshot(
    hwnd_val: isize,
    screenshot_instants: Arc<Mutex<HashMap<isize, Instant>>>,
    screenshot_interval: Duration,
) -> bool {
    let screenshots = screenshot_instants.lock().unwrap();
    if let Some(last_time) = screenshots.get(&hwnd_val) {
        last_time.elapsed() >= screenshot_interval
    } else {
        true
    }
}

async fn execute_screenshot_on_interval(
    hwnd_val: isize,
    app_name: String, // TODO Remove this
) {
    let hwnd_val_copy = hwnd_val;

    let result = tokio::task::spawn_blocking(move || {
        let hwnd = HWND(hwnd_val_copy as *mut std::ffi::c_void);
        screenshot_window(hwnd)
    })
    .await;

    println!("Taking screenshot for app: {}", app_name);

    match result {
        Ok(Some(image)) => {
            println!("Screenshot taken for app: {}", app_name);
            // TODO save screenshot to the db
            // Save to disk for now
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(); // This works for now

            let screenshot_path = format!("screenshots/{}_{}.png", app_name, timestamp);
            image.save(screenshot_path).unwrap();
        }
        Ok(None) => {
            eprintln!("Failed to take screenshot for app: {}", app_name);
        }
        Err(e) => {
            eprintln!("Screenshot task failed for app {}: {}", app_name, e);
        }
    }
}
