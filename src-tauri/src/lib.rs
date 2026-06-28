mod commands;
mod metadata;
mod file_ops;
mod file_watcher;
mod thumbnail;
mod settings;
mod shell_integration;

use tauri::Manager;
use tauri::Emitter;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub watcher: Arc<Mutex<Option<file_watcher::FileWatcher>>>,
    pub settings: Arc<Mutex<settings::AppSettings>>,
    pub playback_history: Arc<Mutex<std::collections::HashMap<String, i64>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let settings = settings::AppSettings::load();
            let state = AppState {
                watcher: Arc::new(Mutex::new(None)),
                settings: Arc::new(Mutex::new(settings)),
                playback_history: Arc::new(Mutex::new(std::collections::HashMap::new())),
            };
            app.manage(state);

            // Register as "Open with" handler in Windows Explorer
            if let Some(exe_path) = std::env::current_exe().ok() {
                shell_integration::register_open_with(&exe_path);
            }

            // Check command-line args for a file path to open
            let args: Vec<String> = std::env::args().skip(1).collect();
            if let Some(file_path) = args.first() {
                let path = std::path::Path::new(file_path);
                if path.exists() {
                    let handle = app.handle().clone();
                    let fp = file_path.clone();
                    tauri::async_runtime::spawn(async move {
                        // Wait for window to be ready
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        let _ = handle.emit("open-file-from-arg", fp);
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_image_as_base64,
            commands::load_image,
            commands::get_folder_files,
            commands::get_thumbnail,
            commands::rotate_image,
            commands::delete_file,
            commands::save_as,
            commands::copy_file_to_clipboard,
            commands::open_in_explorer,
            commands::get_settings,
            commands::save_settings,
            commands::start_file_watcher,
            commands::stop_file_watcher,
            commands::get_playback_position,
            commands::save_playback_position,
            commands::get_video_duration,
            commands::open_file_dialog,
            commands::save_file_dialog,
            commands::confirm_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
