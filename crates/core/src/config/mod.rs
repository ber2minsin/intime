use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub database_url: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            database_url: dirs::config_dir()
                .expect("Failed to get config dir, might be OS related, please issue a PR for this")
                .join("intime")
                .join("data")
                .join("intime.db")
                .to_str()
                .unwrap()
                .to_string(),
        }
    }
}

impl Config {
    fn config_path() -> PathBuf {
        dirs::config_dir()
            .expect("Failed to get config dir, might be OS related, please issue a PR for this")
            .join("intime")
            .join("intime_config.toml")
    }

    pub fn load() -> Result<Self, String> {
        let path = Self::config_path();
        if !path.exists() {
            let _ = Self::save(&Self::default());
        }

        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;

        toml::from_str(&content).map_err(|e| format!("Failed to parse config file: {}", e))
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::config_path();
        let content =
            toml::to_string(self).map_err(|e| format!("Failed to serialize config: {}", e))?;
        std::fs::write(&path, content).map_err(|e| format!("Failed to write config file: {}", e))
    }
}
