use std::path::Path;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::ImageFormat;
use std::io::BufWriter;

pub fn rotate_image(path: &Path) -> Result<(), String> {
    let img = image::open(path).map_err(|e| format!("Failed to open image: {}", e))?;
    let rotated = img.rotate90();

    let ext = path.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let file = std::fs::File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
    let mut writer = BufWriter::new(file);

    match ext.as_str() {
        "jpg" | "jpeg" => {
            let encoder = JpegEncoder::new_with_quality(&mut writer, 95);
            rotated.write_with_encoder(encoder).map_err(|e| format!("Failed to encode: {}", e))?;
        }
        "png" => {
            let encoder = PngEncoder::new(&mut writer);
            rotated.write_with_encoder(encoder).map_err(|e| format!("Failed to encode: {}", e))?;
        }
        "webp" => {
            // Fallback to original format
            rotated.save_with_format(path, ImageFormat::WebP).map_err(|e| format!("Failed to save: {}", e))?;
        }
        _ => {
            rotated.save(path).map_err(|e| format!("Failed to save: {}", e))?;
        }
    }

    Ok(())
}

pub fn delete_to_recycle_bin(path: &Path) -> Result<(), String> {
    trash::delete(path).map_err(|e| format!("Failed to delete file: {}", e))
}

pub fn copy_file(source: &Path, dest: &Path) -> Result<(), String> {
    std::fs::copy(source, dest).map_err(|e| format!("Failed to copy file: {}", e))?;
    Ok(())
}

pub fn get_folder_files(dir: &Path) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let entries = std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
                if crate::metadata::is_supported_file(&ext_str) {
                    files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    // Sort by name (natural sort)
    files.sort_by(|a, b| natural_sort(a, b));

    Ok(files)
}

fn natural_sort(a: &str, b: &str) -> std::cmp::Ordering {
    let a_path = std::path::Path::new(a);
    let b_path = std::path::Path::new(b);
    let a_name = a_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let b_name = b_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

    let a_chars: Vec<char> = a_name.chars().collect();
    let b_chars: Vec<char> = b_name.chars().collect();
    let mut ai = 0;
    let mut bi = 0;

    while ai < a_chars.len() && bi < b_chars.len() {
        if a_chars[ai].is_ascii_digit() && b_chars[bi].is_ascii_digit() {
            // Compare numbers
            let mut a_num = String::new();
            let mut b_num = String::new();
            while ai < a_chars.len() && a_chars[ai].is_ascii_digit() {
                a_num.push(a_chars[ai]);
                ai += 1;
            }
            while bi < b_chars.len() && b_chars[bi].is_ascii_digit() {
                b_num.push(b_chars[bi]);
                bi += 1;
            }
            let a_val: u64 = a_num.parse().unwrap_or(0);
            let b_val: u64 = b_num.parse().unwrap_or(0);
            match a_val.cmp(&b_val) {
                std::cmp::Ordering::Equal => continue,
                other => return other,
            }
        } else {
            match a_chars[ai].to_lowercase().next().cmp(&b_chars[bi].to_lowercase().next()) {
                std::cmp::Ordering::Equal => {}
                other => return other,
            }
            ai += 1;
            bi += 1;
        }
    }

    a_chars.len().cmp(&b_chars.len())
}
