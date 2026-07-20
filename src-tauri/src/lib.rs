use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{Manager, WindowEvent};

#[derive(Default)]
struct CallAuthorityRegistry(Mutex<HashMap<String, String>>);

#[tauri::command]
fn acquire_call_authority(
    window: tauri::Window,
    registry: tauri::State<'_, CallAuthorityRegistry>,
    key: String,
) -> bool {
    let Ok(mut owners) = registry.0.lock() else {
        return false;
    };
    let owner = window.label().to_string();
    match owners.get(&key) {
        Some(current) if current != &owner => false,
        _ => {
            owners.insert(key, owner);
            true
        }
    }
}

#[tauri::command]
fn release_call_authority(
    window: tauri::Window,
    registry: tauri::State<'_, CallAuthorityRegistry>,
    key: String,
) {
    let Ok(mut owners) = registry.0.lock() else {
        return;
    };
    if owners
        .get(&key)
        .is_some_and(|owner| owner == window.label())
    {
        owners.remove(&key);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CallAuthorityRegistry::default())
        .invoke_handler(tauri::generate_handler![
            acquire_call_authority,
            release_call_authority,
        ])
        .on_window_event(|window, event| {
            if !matches!(event, WindowEvent::Destroyed) {
                return;
            }
            let registry = window.state::<CallAuthorityRegistry>();
            let Ok(mut owners) = registry.0.lock() else {
                return;
            };
            let label = window.label();
            owners.retain(|_, owner| owner != label);
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
