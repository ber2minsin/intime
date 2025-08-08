// Expose correct modules for the platform depending on the target OS

// Re-export platform-specific functions/types
#[cfg(target_os = "windows")]
mod win;

#[cfg(target_os = "windows")]
pub use crate::platform::win::*;
