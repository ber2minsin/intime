use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::sync::mpsc::Sender;

use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::Foundation::HWND;
use windows::Win32::Foundation::MAX_PATH;
use windows::Win32::System::Threading::PROCESS_VM_READ;
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_FORMAT, PROCESS_QUERY_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::Accessibility::HWINEVENTHOOK;
use windows::Win32::UI::Accessibility::SetWinEventHook;
use windows::Win32::UI::WindowsAndMessaging::EVENT_OBJECT_CREATE;
use windows::Win32::UI::WindowsAndMessaging::EVENT_OBJECT_NAMECHANGE;
use windows::Win32::UI::WindowsAndMessaging::EVENT_SYSTEM_FOREGROUND;
use windows::Win32::UI::WindowsAndMessaging::GWL_EXSTYLE;
use windows::Win32::UI::WindowsAndMessaging::GetWindowLongW;
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
use windows::Win32::UI::WindowsAndMessaging::IsWindowVisible;
use windows::Win32::UI::WindowsAndMessaging::OBJID_CLIENT;
use windows::Win32::UI::WindowsAndMessaging::OBJID_WINDOW;
use windows::Win32::UI::WindowsAndMessaging::WINEVENT_OUTOFCONTEXT;
use windows::Win32::UI::WindowsAndMessaging::WS_EX_TOOLWINDOW;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
use windows::core::PWSTR;

use crate::core::events::WindowEvent;
use crate::core::events::WindowForegroundEvent;
// For ptr::null_mut() if needed, but PWSTR::null() is better

#[allow(dead_code)] // Allow dead code for now, as this might be used later
fn get_active_window() -> Option<HWND> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == std::ptr::null_mut() {
            None
        } else {
            Some(hwnd)
        }
    }
}

fn get_window_title(hwnd: HWND) -> Option<String> {
    let mut buffer: [u16; MAX_PATH as usize] = [0; MAX_PATH as usize];
    let length = unsafe { GetWindowTextW(hwnd, &mut buffer) };

    if length > 0 {
        Some(String::from_utf16_lossy(&buffer[..length as usize]))
    } else {
        None
    }
}

fn get_process_id(hwnd: HWND) -> Option<u32> {
    let mut process_id: u32 = 0;

    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
    }

    if process_id != 0 {
        Some(process_id)
    } else {
        None
    }
}

fn get_process_handle(process_id: u32) -> Option<HANDLE> {
    unsafe {
        let process_handle = OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            false,
            process_id,
        )
        .ok()?;

        if process_handle.is_invalid() {
            None
        } else {
            Some(process_handle)
        }
    }
}

fn get_app_path(hwnd: HWND) -> Option<String> {
    let process_id = get_process_id(hwnd)?;

    let process_handle = get_process_handle(process_id)?;
    let _handle_closer = scopeguard::guard(process_handle, |h| {
        unsafe { CloseHandle(h) }.ok(); // Ignore result for CloseHandle
    });

    unsafe {
        let mut buffer: [u16; MAX_PATH as usize] = [0; MAX_PATH as usize];
        let mut size: u32 = buffer.len() as u32;

        let success = QueryFullProcessImageNameW(
            process_handle,
            PROCESS_NAME_FORMAT::default(), // Get the full path
            PWSTR(buffer.as_mut_ptr()),
            &mut size, // Size is IN/OUT
        );

        if success.is_ok() {
            let path_u16: &[u16] = &buffer[0..size as usize];

            // Convert the UTF-16 slice to an OsString, then to a String
            let os_string = OsString::from_wide(path_u16);
            let full_path = os_string.to_string_lossy().into_owned();
            Some(full_path)
        } else {
            // Failed
            None
        }
    }
}

fn get_app_name_from_path(full_path: String) -> Option<String> {
    let file_name = std::path::Path::new(&full_path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|s| s.to_string());
    file_name
}

thread_local! {
    static WINDOW_CHANGE_SENDER: std::cell::RefCell<Option<Sender<Box<dyn WindowEvent + Send>>>> =
        std::cell::RefCell::new(None);
}

pub fn set_win_event_hook(
    sender: Sender<Box<dyn WindowEvent + Send>>,
) -> Result<HWINEVENTHOOK, windows::core::Error> {
    WINDOW_CHANGE_SENDER.with(|cell| {
        *cell.borrow_mut() = Some(sender);
    });

    let hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_OBJECT_CREATE, // This is a big range, we narrow it down in the callback
            None,
            Some(win_event_hook_callback),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };

    Ok(hook)
}

unsafe extern "system" fn win_event_hook_callback(
    _hook_handle: HWINEVENTHOOK,
    event_id: u32,
    window_handle: HWND,
    object_id: i32,
    _child_id: i32,
    _thread_id: u32,
    _timestamp: u32,
) {
    if !is_visible_and_valid(window_handle, object_id) {
        return;
    }
    let event_info: Option<Box<dyn WindowEvent + Send>> = match event_id {
        EVENT_SYSTEM_FOREGROUND => {
            if !is_interesting_window(window_handle) {
                println!("Window {:?} is not interesting, skipping.", window_handle);
                return;
            }
            gather_window_info(window_handle)
        }
        EVENT_OBJECT_NAMECHANGE => None,
        _ => None,
    };

    if let Some(event) = event_info {
        send_window_info(event);
    }
}

fn gather_window_info(window_handle: HWND) -> Option<Box<dyn WindowEvent + Send>> {
    let app_path = get_app_path(window_handle);
    let app_name = app_path
        .as_ref()
        .and_then(|path| get_app_name_from_path(path.clone()));
    let app_title = get_window_title(window_handle);
    if app_path.is_none() || app_name.is_none() || app_title.is_none() {
        return None;
    }
    let app_name = app_name.unwrap();
    let app_title = app_title.unwrap();

    let info = WindowForegroundEvent {
        name: app_name,
        title: app_title,
        path: app_path.unwrap(),
        hwnd: window_handle.0 as isize,
    };

    Some(Box::new(info))
}

fn send_window_info(info: Box<dyn WindowEvent + Send>) {
    WINDOW_CHANGE_SENDER.with(|cell| {
        if let Some(sender) = &*cell.borrow() {
            let _ = sender.send(info); // Ignore error if receiver is closed
        }
    });
}

fn is_visible_and_valid(window_handle: HWND, object_id: i32) -> bool {
    // Skip if the handle is null
    if window_handle.0 == std::ptr::null_mut() {
        return false;
    }

    // Check visibility and object type
    let is_visible = unsafe { IsWindowVisible(window_handle) }.as_bool();
    let is_valid_object = object_id == OBJID_WINDOW.0 || object_id == OBJID_CLIENT.0;
    is_visible && is_valid_object
}

fn is_interesting_window(window_handle: HWND) -> bool {
    unsafe {
        let ex_style = GetWindowLongW(window_handle, GWL_EXSTYLE);

        // tool windows
        if (ex_style & WS_EX_TOOLWINDOW.0 as i32) != 0 {
            return false;
        }

        // Check window title
        // TODO make a configurable list to blacklist windows
        if let Some(title) = get_window_title(window_handle) {
            // Skip empty titles or system windows
            if title.is_empty() {
                return false;
            }
        }
    }

    true
}
