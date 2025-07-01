use std::sync::mpsc;

use intime::{models::WindowInfo, tracker};
use windows::Win32::UI::WindowsAndMessaging::{DispatchMessageW, GetMessageW, TranslateMessage};

#[tokio::main]
async fn main() {
    dotenv::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL not set in environment");
    println!("Using database URL: {}", db_url);

    // Only temporary, we will remove this later
    #[allow(unused_variables)]
    let db_pool = intime::db::pool::make_pool(&db_url)
        .await
        .expect("Failed to create database pool");

    let (sender, receiver) = mpsc::channel::<WindowInfo>();

    tokio::spawn(async move {
        let hook = tracker::set_win_event_hook(sender).expect("Failed to set Windows event hook");
        assert!(!hook.is_invalid());

        unsafe {
            let mut msg = std::mem::zeroed();
            while GetMessageW(&mut msg, None, 0, 0).into() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    });

    let mut last_window_info: Option<WindowInfo> = None;

    // Recieve messages from the mcsp channel
    // REFACTOR: This kind of looks messy and can be broken further down into smaller functions
    loop {
        match receiver.try_recv() {
            Ok(window_info) => {
                if last_window_info
                    .as_ref()
                    .map_or(true, |last| last.title != window_info.title)
                {
                    println!("Window changed: {:?}", window_info);
                    last_window_info = Some(window_info);
                }
            }
            Err(_) => {
                // No window change event, sleep for a bit
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            }
        }
    }
}
