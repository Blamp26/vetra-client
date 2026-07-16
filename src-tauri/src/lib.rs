#[derive(Debug, serde::Serialize)]
struct WindowsFullscreenExitState {
    fullscreen: bool,
    maximized: bool,
    resizable: bool,
}

#[tauri::command]
async fn exit_call_fullscreen_windows(
    window: tauri::Window,
    was_resizable: bool,
    was_maximized: bool,
) -> Result<WindowsFullscreenExitState, String> {
    #[cfg(target_os = "windows")]
    {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        let native_window = window.clone();
        window
            .run_on_main_thread(move || {
                let _ = sender.send(exit_call_fullscreen_windows_on_ui_thread(
                    native_window,
                    was_resizable,
                    was_maximized,
                ));
            })
            .map_err(|error| error.to_string())?;
        return receiver
            .recv()
            .map_err(|error| format!("native fullscreen command did not return: {error}"))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, was_resizable, was_maximized);
        Err("Windows fullscreen restoration is unavailable on this platform".to_string())
    }
}

#[cfg(target_os = "windows")]
fn exit_call_fullscreen_windows_on_ui_thread(
    window: tauri::Window,
    was_resizable: bool,
    was_maximized: bool,
) -> Result<WindowsFullscreenExitState, String> {
    use std::mem::size_of;
    use windows::Win32::Foundation::{BOOL, HWND};
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};

    struct DwmTransitionGuard {
        hwnd: HWND,
    }

    impl DwmTransitionGuard {
        fn new(hwnd: HWND) -> Result<Self, String> {
            let disabled = BOOL(1);
            unsafe {
                DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_TRANSITIONS_FORCEDISABLED,
                    &disabled as *const BOOL as *const _,
                    size_of::<BOOL>() as u32,
                )
            }
            .map_err(|error| format!("failed to disable DWM transitions: {error}"))?;
            Ok(Self { hwnd })
        }
    }

    impl Drop for DwmTransitionGuard {
        fn drop(&mut self) {
            let enabled = BOOL(0);
            let _ = unsafe {
                DwmSetWindowAttribute(
                    self.hwnd,
                    DWMWA_TRANSITIONS_FORCEDISABLED,
                    &enabled as *const BOOL as *const _,
                    size_of::<BOOL>() as u32,
                )
            };
        }
    }

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let _transitions = DwmTransitionGuard::new(hwnd)?;
    let mut first_error: Option<String> = None;

    if let Err(error) = window.set_fullscreen(false) {
        first_error = Some(format!("failed to exit Tauri fullscreen: {error}"));
    }
    if let Err(error) = window.set_resizable(was_resizable) {
        first_error.get_or_insert_with(|| format!("failed to restore resizable state: {error}"));
    }
    if was_maximized {
        if let Err(error) = window.maximize() {
            first_error
                .get_or_insert_with(|| format!("failed to restore maximized state: {error}"));
        }
    }

    let fullscreen = window.is_fullscreen().map_err(|error| error.to_string())?;
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    let resizable = window.is_resizable().map_err(|error| error.to_string())?;
    if let Some(error) = first_error {
        return Err(error);
    }
    Ok(WindowsFullscreenExitState {
        fullscreen,
        maximized,
        resizable,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![exit_call_fullscreen_windows])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
