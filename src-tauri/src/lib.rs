use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{ErrorKind, Result as IoResult};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};

use fs2::FileExt;
use tauri::{Manager, WindowEvent};

const AUTHORITY_PREFIX: &str = "vetra:call-authority:";
const MAX_AUTHORITY_KEY_BYTES: usize = 512;

struct NativeLease {
    window_label: String,
    lease_id: String,
    file: File,
}

#[derive(Default)]
struct CallAuthorityRegistry {
    owners: Mutex<HashMap<String, NativeLease>>,
    next_lease_id: AtomicU64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeHolderSnapshot {
    present: bool,
    key_hash: Option<String>,
    lease_suffix: Option<String>,
    window_label: Option<String>,
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.is_empty() || key.len() > MAX_AUTHORITY_KEY_BYTES || !key.starts_with(AUTHORITY_PREFIX) {
        return Err("invalid authority key".to_string());
    }
    Ok(())
}

fn key_hash(key: &str) -> String {
    let mut hash: u64 = 14_695_981_039_346_656_037;
    for byte in key.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    format!("{hash:016x}")
}

fn lock_path(key: &str) -> PathBuf {
    std::env::temp_dir().join(format!("vetra-call-authority-{}.lock", key_hash(key)))
}

fn open_lock_file(key: &str) -> IoResult<File> {
    OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(lock_path(key))
}

fn is_lock_busy(error: &std::io::Error) -> bool {
    error.kind() == ErrorKind::WouldBlock
}

fn next_lease_id(registry: &CallAuthorityRegistry, window_label: &str) -> String {
    let number = registry
        .next_lease_id
        .fetch_add(1, Ordering::Relaxed)
        .wrapping_add(1);
    format!("{window_label}:{number}")
}

#[tauri::command]
fn acquire_call_authority(
    window: tauri::Window,
    registry: tauri::State<'_, CallAuthorityRegistry>,
    key: String,
) -> Result<Option<String>, String> {
    validate_key(&key)?;
    let file = open_lock_file(&key).map_err(|_| "authority lock unavailable".to_string())?;
    let window_label = window.label().to_string();
    let mut owners = registry
        .owners
        .lock()
        .map_err(|_| "authority lock unavailable".to_string())?;

    if let Some(current) = owners.get(&key) {
        if current.window_label != window_label {
            return Ok(None);
        }
        let cloned = current
            .file
            .try_clone()
            .map_err(|_| "authority lock unavailable".to_string())?;
        let lease_id = next_lease_id(&registry, &window_label);
        owners.insert(
            key,
            NativeLease {
                window_label,
                lease_id: lease_id.clone(),
                file: cloned,
            },
        );
        return Ok(Some(lease_id));
    }

    match file.try_lock_exclusive() {
        Ok(()) => {
            let lease_id = next_lease_id(&registry, &window_label);
            owners.insert(
                key,
                NativeLease {
                    window_label,
                    lease_id: lease_id.clone(),
                    file,
                },
            );
            Ok(Some(lease_id))
        }
        Err(error) if is_lock_busy(&error) => Ok(None),
        Err(_) => Err("authority lock unavailable".to_string()),
    }
}

#[tauri::command]
fn release_call_authority(
    window: tauri::Window,
    registry: tauri::State<'_, CallAuthorityRegistry>,
    key: String,
    lease_id: String,
) -> Result<bool, String> {
    validate_key(&key)?;
    let mut owners = registry
        .owners
        .lock()
        .map_err(|_| "authority lock unavailable".to_string())?;
    if owners
        .get(&key)
        .is_some_and(|owner| owner.window_label == window.label() && owner.lease_id == lease_id)
    {
        if let Some(owner) = owners.remove(&key) {
            owner
                .file
                .unlock()
                .map_err(|_| "authority lock unavailable".to_string())?;
        }
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
fn get_call_authority_snapshot(
    window: tauri::Window,
    registry: tauri::State<'_, CallAuthorityRegistry>,
    key: String,
) -> Result<NativeHolderSnapshot, String> {
    validate_key(&key)?;
    let owners = registry
        .owners
        .lock()
        .map_err(|_| "authority lock unavailable".to_string())?;
    if let Some(owner) = owners.get(&key) {
        return Ok(NativeHolderSnapshot {
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
        });
    }
    drop(owners);

    let file = open_lock_file(&key).map_err(|_| "authority lock unavailable".to_string())?;
    let present = match file.try_lock_exclusive() {
        Ok(()) => {
            let _ = file.unlock();
            false
        }
        Err(error) if is_lock_busy(&error) => true,
        Err(_) => return Err("authority lock unavailable".to_string()),
    };
    Ok(NativeHolderSnapshot {
        present,
        key_hash: Some(key_hash(&key)),
        lease_suffix: None,
        window_label: Some(window.label().to_string()),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CallAuthorityRegistry::default())
        .invoke_handler(tauri::generate_handler![
            acquire_call_authority,
            release_call_authority,
            get_call_authority_snapshot
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_validation_is_private_and_bounded() {
        assert!(validate_key("vetra:call-authority:scope:device").is_ok());
        assert!(validate_key("").is_err());
        assert!(validate_key("other:scope").is_err());
        assert!(validate_key(&format!(
            "{AUTHORITY_PREFIX}{}",
            "x".repeat(MAX_AUTHORITY_KEY_BYTES)
        ))
        .is_err());
    }

    #[test]
    fn lock_file_is_exclusive_and_release_allows_takeover() {
        let key = format!("{AUTHORITY_PREFIX}test-exclusive");
        let first = open_lock_file(&key).unwrap();
        first.try_lock_exclusive().unwrap();
        let second = open_lock_file(&key).unwrap();
        assert!(is_lock_busy(&second.try_lock_exclusive().unwrap_err()));
        first.unlock().unwrap();
        second.try_lock_exclusive().unwrap();
        second.unlock().unwrap();
    }

    #[test]
    fn different_keys_do_not_conflict() {
        let first = open_lock_file(&format!("{AUTHORITY_PREFIX}different-a")).unwrap();
        let second = open_lock_file(&format!("{AUTHORITY_PREFIX}different-b")).unwrap();
        first.try_lock_exclusive().unwrap();
        second.try_lock_exclusive().unwrap();
        first.unlock().unwrap();
        second.unlock().unwrap();
    }
}
