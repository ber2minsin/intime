use serde::{Deserialize, Serialize};

// Derive serialize and deserialize traits for WindowInfo
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WindowInfo {
    pub title: String,
    pub executable_name: String,
    pub executable_path: String,
}
