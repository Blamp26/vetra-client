use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{Manager, WindowEvent};

struct NativeLease {
    window_label: String,
    lease_id: String,
}

#[derive(Default)]
struct CallAuthorityRegistry {
    owners: Mutex<HashMap<String, NativeLease>>,
    next_lease_id: Mutex<u64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeHolderSnapshot {
    present: bool,
    key_hash: Option<String>,
    lease_suffix: Option<String>,
    window_label: Option<String>,
}

fn key_hash(key: &str) -> String {
    let mut hash: u32 = 2_166_136_261;
    for byte in key.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16_777_619);
    }
    format!("{hash:08x}")
}

#[tauri::command]
fn acquire_call_authority(
    window: tauri::Window,
    registry: tauri::State<'_, CallAuthorityRegistry>,
    key: String,
) -> Option<String> {
    let Ok(mut owners) = registry.owners.lock() else {
        return None;
    };
    let Ok(mut next_lease_id) = registry.next_lease_id.lock() else {
        return None;
    };
    let owner = window.label().to_string();
    match owners.get(&key) {
        Some(current) if current.window_label != owner => None,
        _ => {
            *next_lease_id = next_lease_id.wrapping_add(1);
            let lease_id = format!("{}:{}", owner, *next_lease_id);
            owners.insert(
                key,
                NativeLease {
                    window_label: owner,
                    lease_id: lease_id.clone(),
                },
            );
            Some(lease_id)
        }
    }
}

#[tauri::command]
fn release_call_authority(
    window: tauri::Window,
    registry: tauri::State<'_, CallAuthorityRegistry>,
    key: String,
    lease_id: String,
) -> bool {
    let Ok(mut owners) = registry.owners.lock() else {
        return false;
    };
    if owners
        .get(&key)
        .is_some_and(|owner| owner.window_label == window.label() && owner.lease_id == lease_id)
    {
        owners.remove(&key);
        true
    } else {
        false
    }
}

#[tauri::command]
fn get_call_authority_snapshot(
    window: tauri::Window,
    registry: tauri::State<'_, CallAuthorityRegistry>,
    key: String,
) -> NativeHolderSnapshot {
    let Ok(owners) = registry.owners.lock() else {
        return NativeHolderSnapshot {
            present: false,
            key_hash: None,
            lease_suffix: None,
            window_label: Some(window.label().to_string()),
        };
    };
    match owners.get(&key) {
        Some(owner) => NativeHolderSnapshot {
            present: true,
            key_hash: Some(key_hash(&key)),
            lease_suffix: Some(
                owner
                    .lease_id
                    .chars()
                    .rev()
                    .take(8)
                    .collect::<String>()
                    .chars()
                    .rev()
                    .collect(),
            ),
            window_label: Some(owner.window_label.clone()),
        },
        None => NativeHolderSnapshot {
            present: false,
            key_hash: Some(key_hash(&key)),
            lease_suffix: None,
            window_label: Some(window.label().to_string()),
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CallAuthorityRegistry::default())
        .invoke_handler(tauri::generate_handler![
            acquire_call_authority,
            release_call_authority,
            get_call_authority_snapshot,
        ])
        .on_window_event(|window, event| {
            if !matches!(event, WindowEvent::Destroyed) {
                return;
            }
            let registry = window.state::<CallAuthorityRegistry>();
            let Ok(mut owners) = registry.owners.lock() else {
                return;
            };
            let label = window.label();
            owners.retain(|_, owner| owner.window_label != label);
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
