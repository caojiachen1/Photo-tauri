use std::path::Path;
use image::imageops::FilterType;
use image::GenericImageView;

pub fn generate_thumbnail(path: &Path, max_size: u32) -> Result<String, String> {
    let img = image::open(path).map_err(|e| format!("Failed to open image: {}", e))?;

    let (width, height) = img.dimensions();
    let ratio = (max_size as f64) / (width.max(height) as f64);
    let new_width = (width as f64 * ratio).max(1.0) as u32;
    let new_height = (height as f64 * ratio).max(1.0) as u32;

    // Use Nearest filter for speed (Triangle is slow for large images)
    let thumbnail = img.resize(new_width, new_height, FilterType::Nearest);

    let mut buf: Vec<u8> = Vec::new();
    thumbnail.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode thumbnail: {}", e))?;

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}
