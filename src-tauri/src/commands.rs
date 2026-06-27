use crate::metadata::{ImageMetadata, extract_metadata, is_image_file, is_video_file};
use crate::file_ops;
use crate::thumbnail;
use crate::settings::AppSettings;
use crate::AppState;
use crate::file_watcher::FileWatcher;
use std::path::Path;
use tauri::State;
use tauri::AppHandle;

#[tauri::command]
pub fn load_image(path: String) -> Result<ImageMetadata, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File does not exist".to_string());
    }
    extract_metadata(p)
}

#[tauri::command]
pub fn get_folder_files(path: String) -> Result<Vec<String>, String> {
    let p = Path::new(&path);
    let dir = p.parent().ok_or("Cannot get parent directory")?;
    file_ops::get_folder_files(dir)
}

#[tauri::command]
pub fn get_image_as_base64(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let data = std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy().to_lowercase())).unwrap_or_default();
    let mime = match ext.as_str() {
        ".jpg" | ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".bmp" => "image/bmp",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        _ => "application/octet-stream",
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub fn get_thumbnail(path: String, size: Option<u32>) -> Result<String, String> {
    let p = Path::new(&path);
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy().to_lowercase())).unwrap_or_default();

    if is_video_file(&ext) {
        // For videos, return a placeholder icon or try to extract a frame
        return Err("Video thumbnails not yet supported".to_string());
    }

    if !is_image_file(&ext) {
        return Err("Unsupported file type".to_string());
    }

    thumbnail::generate_thumbnail(p, size.unwrap_or(200))
}

#[tauri::command]
pub fn rotate_image(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    file_ops::rotate_image(p)
}

#[tauri::command]
pub async fn delete_file(path: String, _app: AppHandle) -> Result<(), String> {
    let p = Path::new(&path);
    file_ops::delete_to_recycle_bin(p)
}

#[tauri::command]
pub fn save_as(source: String, destination: String) -> Result<(), String> {
    let src = Path::new(&source);
    let dst = Path::new(&destination);
    file_ops::copy_file(src, dst)
}

#[tauri::command]
pub fn copy_file_to_clipboard(_path: String) -> Result<(), String> {
    // Copy file path to clipboard - the frontend will handle image copying
    Err("Use frontend clipboard API".to_string())
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(dir) = p.parent() {
            std::process::Command::new("xdg-open")
                .arg(dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().await;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<(), String> {
    settings.save()?;
    let mut s = state.settings.lock().await;
    *s = settings;
    Ok(())
}

#[tauri::command]
pub async fn start_file_watcher(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut watcher = state.watcher.lock().await;
    // Stop existing watcher
    *watcher = None;
    // Start new watcher
    let new_watcher = FileWatcher::new(&path, app)?;
    *watcher = Some(new_watcher);
    Ok(())
}

#[tauri::command]
pub async fn stop_file_watcher(state: State<'_, AppState>) -> Result<(), String> {
    let mut watcher = state.watcher.lock().await;
    *watcher = None;
    Ok(())
}

#[tauri::command]
pub async fn get_playback_position(path: String, state: State<'_, AppState>) -> Result<i64, String> {
    let history = state.playback_history.lock().await;
    Ok(history.get(&path).copied().unwrap_or(0))
}

#[tauri::command]
pub async fn save_playback_position(path: String, position: i64, state: State<'_, AppState>) -> Result<(), String> {
    let mut history = state.playback_history.lock().await;
    history.insert(path, position);
    Ok(())
}

#[tauri::command]
pub fn get_video_duration(_path: String) -> Result<i64, String> {
    Ok(0) // Placeholder
}

#[tauri::command]
pub async fn open_file_dialog(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog().file().blocking_pick_file();
    Ok(file.and_then(|f| file_path_to_string(f)))
}

#[tauri::command]
pub async fn save_file_dialog(app: AppHandle, default_name: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog().file()
        .set_file_name(&default_name)
        .blocking_save_file();
    Ok(file.and_then(|f| file_path_to_string(f)))
}

#[tauri::command]
pub async fn confirm_dialog(app: AppHandle, title: String, message: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = app.dialog()
        .message(&message)
        .title(&title)
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
        .blocking_show();
    Ok(result)
}

fn file_path_to_string(fp: tauri_plugin_dialog::FilePath) -> Option<String> {
    match fp {
        tauri_plugin_dialog::FilePath::Path(p) => Some(p.to_string_lossy().to_string()),
        tauri_plugin_dialog::FilePath::Url(u) => Some(u.to_string()),
    }
}
