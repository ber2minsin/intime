import traceback
from typing import Callable, Set

import win32gui
import win32process
import win32con
import win32api
import win32ui

import ctypes
import ctypes.util

import os
import psutil
from pydantic import BaseModel
import win32event
import ctypes.wintypes
import time
import threading

ICON_SIZES = (256, 128, 64, 48, 32, 16)  # Sizes to extract icons in pixels


class WindowInfo(BaseModel):
    """Pydantic model for storing window information."""

    title: str
    process_id: int
    handle: int
    position: tuple[int, int]  # (x, y)
    size: tuple[int, int]  # (width, height)
    is_visible: bool
    is_minimized: bool
    is_maximized: bool
    class_name: str | None = None
    executable_path: str | None = None
    application_name: str | None = None
    icon_path: str | None = None


def _get_process_info(pid: int) -> tuple[str | None, str | None]:
    """
    Get the executable path and application name for a process ID.
    Returns a tuple of (executable_path, application_name).
    """
    try:
        process = psutil.Process(pid)
        exe_path = process.exe()
        app_name = os.path.basename(exe_path)
        # Remove extension if it exists
        app_name = os.path.splitext(app_name)[0]
        return exe_path, app_name
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return None, None


def _get_window_info(hwnd: int) -> WindowInfo | None:
    """Get information about a specific window handle."""
    if not win32gui.IsWindowVisible(hwnd):
        return None
    else:
        print(f"Window Handle: {hwnd} is being skipped because it is not visible.")
        traceback.print_exc()

    title = win32gui.GetWindowText(hwnd)
    if not title:
        return None
    else:
        print(f"Window Handle: {hwnd} is being skipped because it has an empty title.")
        traceback.print_exc()

    rect = win32gui.GetWindowRect(hwnd)
    x, y, right, bottom = rect
    width = right - x
    height = bottom - y

    _, pid = win32process.GetWindowThreadProcessId(hwnd)
    executable_path, application_name = _get_process_info(pid)

    style = win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE)
    is_minimized = bool(style & win32con.WS_MINIMIZE)
    is_maximized = bool(style & win32con.WS_MAXIMIZE)

    class_name = win32gui.GetClassName(hwnd)

    for size in ICON_SIZES:
        icon_path = extract_icon(executable_path, size=size)
        if icon_path:
            break

    # Construct WindowInfo object
    return WindowInfo(
        title=title,
        process_id=pid,
        handle=hwnd,
        position=(x, y),
        size=(width, height),
        is_visible=True,
        is_minimized=is_minimized,
        is_maximized=is_maximized,
        class_name=class_name,
        executable_path=executable_path,
        application_name=application_name,
        icon_path=icon_path,
    )


def get_all_apps() -> list[WindowInfo]:
    """Return information about all visible foreground applications."""
    result = []

    def enum_windows_callback(hwnd, results):
        window_info = _get_window_info(hwnd)
        if window_info is not None:
            results.append(window_info)
        return True

    win32gui.EnumWindows(enum_windows_callback, result)
    return result


def get_active_app() -> WindowInfo | None:
    """Return information about the currently focused application."""
    hwnd = win32gui.GetForegroundWindow()
    if hwnd:
        return _get_window_info(hwnd)
    return None


def get_app_by_title(title_substring: str) -> list[WindowInfo]:
    """Find applications by partial title match."""
    return [
        app for app in get_all_apps() if title_substring.lower() in app.title.lower()
    ]


def get_app_by_pid(pid: int) -> list[WindowInfo]:
    """Find applications by process ID."""
    return [app for app in get_all_apps() if app.process_id == pid]


def get_app_by_name(app_name: str) -> list[WindowInfo]:
    """Find applications by application name (case-insensitive partial match)."""
    return [
        app
        for app in get_all_apps()
        if app.application_name and app_name.lower() in app.application_name.lower()
    ]


# Constants for SetWinEventHook
WINEVENT_OUTOFCONTEXT = 0x0000
WINEVENT_SKIPOWNTHREAD = 0x0001
WINEVENT_SKIPOWNPROCESS = 0x0002
WINEVENT_INCONTEXT = 0x0004

# Event mapping for meaningful names
EVENT_TYPES = {
    win32con.EVENT_SYSTEM_FOREGROUND: "Foreground",
    win32con.EVENT_OBJECT_FOCUS: "Focus",
    win32con.EVENT_OBJECT_SHOW: "Show",
    win32con.EVENT_SYSTEM_DIALOGSTART: "Dialog",
    win32con.EVENT_SYSTEM_CAPTURESTART: "Capture",
    win32con.EVENT_SYSTEM_MINIMIZEEND: "UnMinimize",
}

# Define the callback type
WinEventProcType = ctypes.WINFUNCTYPE(
    None,
    ctypes.wintypes.HANDLE,
    ctypes.wintypes.DWORD,
    ctypes.wintypes.HWND,
    ctypes.wintypes.LONG,
    ctypes.wintypes.LONG,
    ctypes.wintypes.DWORD,
    ctypes.wintypes.DWORD,
)

# Global variables to manage the event hook
_event_hook = None
_callback_func = None
_running = False
_listening_thread = None
_stop_event = None


def _win_event_callback(
    hWinEventHook, event, hwnd, idObject, idChild, dwEventThread, dwmsEventTime
):
    """Callback function for WinEvents."""
    if event in EVENT_TYPES and _callback_func is not None:
        # Only process if the event is one we're interested in
        try:
            event_name = EVENT_TYPES[event]
            window_info = _get_window_info(hwnd) if hwnd else None

            # Call the user-supplied callback with the event type and window information
            _callback_func(event_name, window_info)
        except Exception as e:
            print(f"Error in window event callback: {e}")


def start_window_event_listener(
    callback: Callable[[str, WindowInfo | None], None],
    events_to_track: Set[int] = None,
) -> bool:
    """
    Set up a listener for window events.

    Args:
        callback: Function to call when an event occurs.
                 Will be called with (event_name, window_info)
        events_to_track: Set of event types to listen for. If None, listen for all events in EVENT_TYPES.

    Returns:
        bool: True if the listener was started successfully, False otherwise.
    """
    global _event_hook, _callback_func, _running, _listening_thread, _stop_event

    if _running:
        print("Window event listener is already running")
        return False

    if events_to_track is None:
        events_to_track = set(EVENT_TYPES.keys())

    _callback_func = callback

    _stop_event = win32event.CreateEvent(None, 0, 0, None)
    _listening_thread = threading.Thread(
        target=_run_event_loop, args=(events_to_track, _stop_event), daemon=True
    )

    _running = True
    _listening_thread.start()
    return True


def _run_event_loop(events_to_track, stop_event):
    """Run the Windows event loop in a separate thread."""
    global _event_hook, _running

    WinEventProc = WinEventProcType(_win_event_callback)

    hooks = []
    for event_type in events_to_track:
        hook = ctypes.windll.user32.SetWinEventHook(
            event_type,
            event_type,
            0,
            WinEventProc,
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNTHREAD,
        )
        if hook:
            hooks.append(hook)

    if not hooks:
        print("Failed to set up any event hooks")
        _running = False
        return

    print(f"Set up {len(hooks)} event hooks")

    msg = ctypes.wintypes.MSG()
    while _running:
        if win32event.WaitForSingleObject(stop_event, 0) == win32event.WAIT_OBJECT_0:
            break

        # Process Windows messages
        if ctypes.windll.user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 1):
            ctypes.windll.user32.TranslateMessage(ctypes.byref(msg))
            ctypes.windll.user32.DispatchMessageW(ctypes.byref(msg))

        # Sleep a bit to avoid high CPU
        time.sleep(0.01)

    # Unhook the event hooks
    for hook in hooks:
        ctypes.windll.user32.UnhookWinEvent(hook)

    _running = False
    print("Window event listener stopped")


def stop_window_event_listener():
    """Stop the window event listener."""
    global _running, _stop_event

    if not _running:
        print("Window event listener is not running")
        return

    # Signal the thread to stop
    _running = False
    win32event.SetEvent(_stop_event)

    # Wait for the thread to finish
    if _listening_thread and _listening_thread.is_alive():
        _listening_thread.join(timeout=2.0)
        if _listening_thread.is_alive():
            print("Warning: Event listener thread did not terminate properly")

    print("Window event listener stopped")


def _get_icon_path(exe_path: str, size: int) -> str:
    """Generate a unique path for saving the icon based on the executable path and size."""
    app_name = os.path.splitext(os.path.basename(exe_path))[0]
    import hashlib

    exe_hash = hashlib.md5(exe_path.encode()).hexdigest()[:8]

    icon_dir = os.environ.get(
        "TEMP_ICON_PATH", "D:\\Workspace\\time-trek\\icons"
    )  # TODO refactor
    os.makedirs(icon_dir, exist_ok=True)

    return os.path.join(icon_dir, f"{app_name}_{exe_hash}_{size}.bmp")


def _extract_icons_from_file(file_path: str) -> tuple[list, list]:
    """Extract large and small icons from a file."""
    try:
        return win32gui.ExtractIconEx(file_path, 0)
    except Exception as e:
        print(f"Failed to extract icons from {file_path}: {e}")
        return [], []


def _get_icon_handle(icons: tuple, size: int) -> int:
    """Select an appropriate icon handle based on the requested size."""
    large_icons, small_icons = icons

    # Choose appropriate icon based on size
    if size <= 32 and small_icons:
        return small_icons[0]
    elif large_icons:
        return large_icons[0]

    return None


def _cleanup_icon_handles(icons: tuple, used_handle: int = None):
    """Clean up icon handles to prevent resource leaks."""
    large_icons, small_icons = icons

    for handle in large_icons:
        if handle and handle != used_handle:
            win32gui.DestroyIcon(handle)

    for handle in small_icons:
        if handle and handle != used_handle:
            win32gui.DestroyIcon(handle)


def _save_icon_to_bitmap(icon_handle: int, icon_path: str) -> bool:
    """Save an icon handle to a bitmap file."""
    try:
        hdc = win32ui.CreateDCFromHandle(win32gui.GetDC(0))
        icon_info = win32gui.GetIconInfo(icon_handle)
        if not icon_info or not icon_info[4]:  # Check if hbmColor exists
            return False

        bminfo = win32gui.GetObject(icon_info[4])

        hbmp = win32ui.CreateBitmap()
        hbmp.CreateCompatibleBitmap(hdc, bminfo.bmWidth, bminfo.bmHeight)
        hcdc = hdc.CreateCompatibleDC()
        hcdc.SelectObject(hbmp)

        win32gui.DrawIconEx(
            hcdc.GetHandleOutput(),
            0,
            0,
            icon_handle,
            bminfo.bmWidth,
            bminfo.bmHeight,
            0,
            0,
            win32con.DI_NORMAL,
        )

        hbmp.SaveBitmapFile(hcdc, icon_path)

        # Clean up resources
        hcdc.DeleteDC()
        if icon_info[3]:  # hbmMask
            win32gui.DeleteObject(icon_info[3])
        if icon_info[4]:  # hbmColor
            win32gui.DeleteObject(icon_info[4])

        return True

    except Exception as e:
        print(f"Error saving icon to bitmap: {e}")
        return False


def extract_icon(exe_path: str, size: int = 32) -> str | None:
    """
    Extract an icon from an executable and save it to a file.
    Returns the path to the saved icon file.

    Args:
        exe_path: Path to the executable to extract icon from
        size: Desired icon size (default 32)

    Returns:
        Path to the saved icon file or None if extraction failed
    """
    if not exe_path or not os.path.exists(exe_path):
        return None

    try:
        icon_path = _get_icon_path(exe_path, size)

        # Check if extracted before
        if os.path.exists(icon_path):
            return icon_path

        icons = _extract_icons_from_file(exe_path)
        if not icons or len(icons) < 2 or (not icons[0] and not icons[1]):
            shell32_path = os.path.join(
                os.environ["SystemRoot"], "System32", "shell32.dll"
            )
            icons = _extract_icons_from_file(shell32_path)
            if not icons or len(icons) < 2 or (not icons[0] and not icons[1]):
                return None

        # Get an appropriate icon handle
        icon_handle = _get_icon_handle(icons, size)
        if not icon_handle:
            _cleanup_icon_handles(icons)
            return None

        try:
            success = _save_icon_to_bitmap(icon_handle, icon_path)
            win32gui.DestroyIcon(icon_handle)
            _cleanup_icon_handles(icons, icon_handle)
            return icon_path if success else None

        except Exception as e:
            print(f"Error saving icon: {e}")
            # Clean up resources
            if icon_handle:
                win32gui.DestroyIcon(icon_handle)
            _cleanup_icon_handles(icons, icon_handle)
            return None

    except Exception as e:
        print(f"Error extracting icon from {exe_path}: {e}")
        traceback.print_exc()
        return None
