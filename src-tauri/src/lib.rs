mod commands;
mod metadata;
mod file_ops;
mod file_watcher;
mod thumbnail;
mod settings;

use tauri::Manager;
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
