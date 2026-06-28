use std::path::Path;

#[cfg(target_os = "windows")]
pub fn register_open_with(exe_path: &Path) {
    use winreg::enums::*;
    use winreg::RegKey;

    let exe_name = exe_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    let app_key_path = format!("Software\\Classes\\Applications\\{}", exe_name);
    if let Ok(app_key) = hkcu.create_subkey(&app_key_path) {
        let _ = app_key.0.set_value("FriendlyAppName", &"Photo".to_string());

        if let Ok(cmd_key) = app_key.0.create_subkey("shell\\open\\command") {
            let cmd = format!("\"{}\" \"%1\"", exe_path.display());
            let _ = cmd_key.0.set_value("", &cmd);
        }

        if let Ok(icon_key) = app_key.0.create_subkey("DefaultIcon") {
            let icon = format!("\"{},0\"", exe_path.display());
            let _ = icon_key.0.set_value("", &icon);
        }
    }

    let supported_exts = [
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif",
        ".ico", ".heic", ".heif", ".avif",
        ".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".webm",
    ];

    for ext in &supported_exts {
        let ext_key_path = format!("Software\\Classes\\{}\\OpenWithProgids", ext);
        if let Ok(ext_key) = hkcu.create_subkey(&ext_key_path) {
            let prog_id = format!("{}.file", exe_name.replace(".exe", ""));
            let _ = ext_key.0.set_value(&prog_id, &String::new());
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn register_open_with(_exe_path: &Path) {}
