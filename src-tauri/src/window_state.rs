use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Window};

const FILE_NAME: &str = "window-state.json";

/// Size and position of the main window, restored on the next start.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
    pub x: f64,
    pub y: f64,
    pub maximized: bool,
}

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(FILE_NAME))
}

/// Applies the stored window geometry. Missing or unreadable state is ignored so
/// that the defaults from `tauri.conf.json` stay in effect.
pub fn restore(window: &Window) {
    let Some(path) = state_path(&window.app_handle().clone()) else {
        return;
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return;
    };
    let Ok(state) = serde_json::from_str::<WindowState>(&contents) else {
        return;
    };

    let _ = window.set_size(LogicalSize::new(state.width, state.height));
    let _ = window.set_position(LogicalPosition::new(state.x, state.y));
    if state.maximized {
        let _ = window.maximize();
    }
}

/// Persists the current window geometry next to the database.
pub fn save(window: &Window) {
    let app = window.app_handle().clone();
    let Some(path) = state_path(&app) else {
        return;
    };
    let Ok(scale) = window.scale_factor() else {
        return;
    };
    let (Ok(size), Ok(position), Ok(maximized)) = (
        window.inner_size(),
        window.outer_position(),
        window.is_maximized(),
    ) else {
        return;
    };

    let size = size.to_logical::<f64>(scale);
    let position = position.to_logical::<f64>(scale);
    let state = WindowState {
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        maximized,
    };

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(contents) = serde_json::to_string(&state) {
        let _ = fs::write(path, contents);
    }
}

#[cfg(test)]
mod tests {
    use super::WindowState;

    #[test]
    fn serializes_round_trip() {
        let state = WindowState {
            width: 1440.0,
            height: 900.0,
            x: 10.0,
            y: 20.0,
            maximized: false,
        };
        let json = serde_json::to_string(&state).expect("serialize");
        let parsed: WindowState = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.width, 1440.0);
        assert_eq!(parsed.height, 900.0);
        assert_eq!(parsed.x, 10.0);
        assert_eq!(parsed.y, 20.0);
        assert!(!parsed.maximized);
    }
}
