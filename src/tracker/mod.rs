use crate::models::WindowInfo;

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
use windows::Win32::UI::WindowsAndMessaging::EVENT_OBJECT_NAMECHANGE;
use windows::Win32::UI::WindowsAndMessaging::EVENT_SYSTEM_FOREGROUND;
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
use windows::Win32::UI::WindowsAndMessaging::WINEVENT_OUTOFCONTEXT;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
use windows::core::PWSTR;
// For ptr::null_mut() if needed, but PWSTR::null() is better

pub fn get_active_window() -> Option<HWND> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == std::ptr::null_mut() {
            None
        } else {
            Some(hwnd)
        }
    }
}

pub fn get_active_window_info(hwnd: HWND) -> Option<WindowInfo> {
    // Get the window title
    let title = get_window_title(hwnd)?;
    // Get the exe name
    let app_path = get_app_path(hwnd)?;
    let app_name = get_file_name_from_path(app_path.clone())?;

    Some(WindowInfo {
        title,
        executable_name: app_name,
        executable_path: app_path,
    })
}

pub fn get_window_title(hwnd: HWND) -> Option<String> {
    let mut buffer: [u16; MAX_PATH as usize] = [0; MAX_PATH as usize];
    let length = unsafe { GetWindowTextW(hwnd, &mut buffer) };

    if length > 0 {
        Some(String::from_utf16_lossy(&buffer[..length as usize]))
    } else {
        None
    }
}

pub fn get_process_id(hwnd: HWND) -> Option<u32> {
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

pub fn get_process_handle(process_id: u32) -> Option<HANDLE> {
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
pub fn get_app_path(hwnd: HWND) -> Option<String> {
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

fn get_file_name_from_path(full_path: String) -> Option<String> {
    let file_name = std::path::Path::new(&full_path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|s| s.to_string());
    file_name
}

thread_local! {
    static WINDOW_CHANGE_SENDER: std::cell::RefCell<Option<Sender<WindowInfo>>> =
        std::cell::RefCell::new(None);
}

pub fn set_win_event_hook(
    sender: Sender<WindowInfo>,
) -> Result<HWINEVENTHOOK, windows::core::Error> {
    WINDOW_CHANGE_SENDER.with(|cell| {
        *cell.borrow_mut() = Some(sender);
    });

    let hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_OBJECT_NAMECHANGE,
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
    _object_id: i32,
    _child_id: i32,
    _thread_id: u32,
    _timestamp: u32,
) {
    // Only check title change and foreground change events
    if event_id != EVENT_SYSTEM_FOREGROUND && event_id != EVENT_OBJECT_NAMECHANGE {
        return;
    }

    if let Some(info) = get_active_window_info(window_handle) {
        send_window_info(info);
    }
}

fn send_window_info(info: WindowInfo) {
    WINDOW_CHANGE_SENDER.with(|cell| {
        if let Some(sender) = &*cell.borrow() {
            let _ = sender.send(info); // Ignore error if receiver is closed
        }
    });
}
