use std::any::Any;
use std::{fmt::Debug, fmt::Display};

pub struct WindowEventType {
    pub event_code: u32,
}

impl WindowEventType {
    pub fn new(event_code: u32) -> Self {
        WindowEventType { event_code }
    }
}

impl Debug for WindowEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.event_code {
            32780u32 => write!(f, "EVENT_SYSTEM_NAMECHANGE"),
            3u32 => write!(f, "EVENT_SYSTEM_FOREGROUND"),
            32768u32 => write!(f, "EVENT_OBJECT_CREATE"),
            32769u32 => write!(f, "EVENT_OBJECT_DESTROY"),
            32771u32 => write!(f, "EVENT_OBJECT_HIDE"),
            23u32 => write!(f, "EVENT_SYSTEM_MINIMIZEEND"), // This is for restoring minimized windows, same as EVENT_SYSTEM_FOREGROUND but does not include input focus
            22u32 => write!(f, "EVENT_SYSTEM_MINIMIZESTART"),
            32773u32 => write!(f, "EVENT_OBJECT_FOCUS"), // This hook is for keyboard focus changes
            _ => Err(std::fmt::Error),
        }
    }
}

impl Display for WindowEventType {
    // This may change
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let readable_event_code = format!("{:?}", self.event_code);
        write!(f, "{}", readable_event_code)
    }
}

pub trait WindowEvent {
    // Windows event type
    fn event(&self) -> WindowEventType; // Fucking os is named windows and is consisting of window(s), how can I name this shit?
    fn as_any(&self) -> &dyn Any;
}

pub struct WindowForegroundEvent {
    pub name: String,
    pub title: String,
    pub path: String,
}

impl WindowEvent for WindowForegroundEvent {
    fn event(&self) -> WindowEventType {
        return WindowEventType {
            event_code: windows::Win32::UI::WindowsAndMessaging::EVENT_SYSTEM_FOREGROUND,
        };
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}
