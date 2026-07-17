#[derive(Debug, serde::Serialize)]
struct WindowsFullscreenState {
    fullscreen: bool,
    maximized: bool,
    resizable: bool,
}

#[cfg(target_os = "windows")]
mod windows_fullscreen {
    use super::WindowsFullscreenState;
    use std::mem::size_of;
    use std::sync::{Mutex, OnceLock};
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
    use windows::Win32::Graphics::Gdi::{
        RedrawWindow, RDW_ALLCHILDREN, RDW_ERASE, RDW_FRAME, RDW_INVALIDATE, RDW_UPDATENOW,
    };
    use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, WM_SETREDRAW};

    static REDRAW_GUARD: OnceLock<Mutex<Option<NativeRedrawGuard>>> = OnceLock::new();

    struct NativeRedrawGuard {
        hwnd_value: usize,
        finished: bool,
    }

    impl NativeRedrawGuard {
        fn hwnd(&self) -> HWND {
            HWND(self.hwnd_value as *mut std::ffi::c_void)
        }
    }

    impl NativeRedrawGuard {
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
            unsafe {
                SendMessageW(hwnd, WM_SETREDRAW, Some(WPARAM(0)), Some(LPARAM(0)));
            }
            Ok(Self {
                hwnd_value: hwnd.0 as usize,
                finished: false,
            })
        }

        fn finish(mut self) {
            unsafe {
                SendMessageW(self.hwnd(), WM_SETREDRAW, Some(WPARAM(1)), Some(LPARAM(0)));
            }
            unsafe {
                let _ = RedrawWindow(
                    Some(self.hwnd()),
                    None,
                    None,
                    RDW_INVALIDATE | RDW_ERASE | RDW_FRAME | RDW_UPDATENOW | RDW_ALLCHILDREN,
                );
            }
            self.finished = true;
        }
    }

    impl Drop for NativeRedrawGuard {
        fn drop(&mut self) {
            if !self.finished {
                unsafe {
                    SendMessageW(self.hwnd(), WM_SETREDRAW, Some(WPARAM(1)), Some(LPARAM(0)));
                }
                unsafe {
                    let _ = RedrawWindow(
                        Some(self.hwnd()),
                        None,
                        None,
                        RDW_INVALIDATE | RDW_ERASE | RDW_FRAME | RDW_UPDATENOW | RDW_ALLCHILDREN,
                    );
                }
            }
            let enabled = BOOL(0);
            let _ = unsafe {
                DwmSetWindowAttribute(
                    self.hwnd(),
                    DWMWA_TRANSITIONS_FORCEDISABLED,
                    &enabled as *const BOOL as *const _,
                    size_of::<BOOL>() as u32,
                )
            };
        }
    }

    pub fn begin(
        window: tauri::Window,
        enter: bool,
        was_resizable: bool,
        was_maximized: bool,
    ) -> Result<WindowsFullscreenState, String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        let slot = REDRAW_GUARD.get_or_init(|| Mutex::new(None));
        if slot
            .lock()
            .map_err(|_| "fullscreen redraw guard is poisoned")?
            .is_some()
        {
            return Err("fullscreen redraw handoff is already active".to_string());
        }
        let guard = NativeRedrawGuard::new(hwnd)?;

        let result: Result<WindowsFullscreenState, String> = (|| {
            if enter {
                if was_maximized {
                    window.unmaximize().map_err(|error| {
                        format!("failed to unmaximize before fullscreen: {error}")
                    })?;
                }
                window.set_resizable(false).map_err(|error| {
                    format!("failed to disable resizing before fullscreen: {error}")
                })?;
                window
                    .set_fullscreen(true)
                    .map_err(|error| format!("failed to enter Tauri fullscreen: {error}"))?;
            } else {
                window
                    .set_fullscreen(false)
                    .map_err(|error| format!("failed to exit Tauri fullscreen: {error}"))?;
                window
                    .set_resizable(was_resizable)
                    .map_err(|error| format!("failed to restore resizable state: {error}"))?;
                if was_maximized {
                    window
                        .maximize()
                        .map_err(|error| format!("failed to restore maximized state: {error}"))?;
                }
            }
            Ok(WindowsFullscreenState {
                fullscreen: window.is_fullscreen().map_err(|error| error.to_string())?,
                maximized: window.is_maximized().map_err(|error| error.to_string())?,
                resizable: window.is_resizable().map_err(|error| error.to_string())?,
            })
        })();
        let state = result?;
        slot.lock()
            .map_err(|_| "fullscreen redraw guard is poisoned")?
            .replace(guard);
        Ok(state)
    }

    pub fn finish(window: tauri::Window) -> Result<WindowsFullscreenState, String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        let guard = REDRAW_GUARD
            .get_or_init(|| Mutex::new(None))
            .lock()
            .map_err(|_| "fullscreen redraw guard is poisoned")?
            .take();
        if let Some(guard) = guard {
            if guard.hwnd_value != hwnd.0 as usize {
                return Err("fullscreen redraw guard belongs to another window".to_string());
            }
            guard.finish();
        }
        Ok(WindowsFullscreenState {
            fullscreen: window.is_fullscreen().map_err(|error| error.to_string())?,
            maximized: window.is_maximized().map_err(|error| error.to_string())?,
            resizable: window.is_resizable().map_err(|error| error.to_string())?,
        })
    }
}

#[tauri::command]
async fn begin_call_fullscreen_windows(
    window: tauri::Window,
    enter: bool,
    was_resizable: bool,
    was_maximized: bool,
) -> Result<WindowsFullscreenState, String> {
    #[cfg(target_os = "windows")]
    {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        let native_window = window.clone();
        window
            .run_on_main_thread(move || {
                let _ = sender.send(windows_fullscreen::begin(
                    native_window,
                    enter,
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
        let _ = (window, enter, was_resizable, was_maximized);
        Err("Windows fullscreen handoff is unavailable on this platform".to_string())
    }
}

#[tauri::command]
async fn finish_call_fullscreen_windows(
    window: tauri::Window,
) -> Result<WindowsFullscreenState, String> {
    #[cfg(target_os = "windows")]
    {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        let native_window = window.clone();
        window
            .run_on_main_thread(move || {
                let _ = sender.send(windows_fullscreen::finish(native_window));
            })
            .map_err(|error| error.to_string())?;
        return receiver
            .recv()
            .map_err(|error| format!("native fullscreen command did not return: {error}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        Err("Windows fullscreen handoff is unavailable on this platform".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            begin_call_fullscreen_windows,
            finish_call_fullscreen_windows
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
