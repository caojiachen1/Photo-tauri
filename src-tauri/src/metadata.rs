use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FaceRegion {
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub file_size: u64,
    pub file_name: String,
    pub file_path: String,
    pub file_type: String,
    pub created_date: String,
    pub modified_date: String,
    pub date_time_original: String,
    pub camera_model: String,
    pub f_number: String,
    pub exposure_time: String,
    pub iso: String,
    pub focal_length: String,
    pub keywords: Vec<String>,
    pub people: Vec<String>,
    pub face_regions: Vec<FaceRegion>,
    pub duration_ms: i64,
    pub is_video: bool,
    pub thumbnail_base64: String,
}

pub fn extract_metadata(path: &Path) -> Result<ImageMetadata, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let file_name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let file_path = path.to_string_lossy().to_string();
    let file_type = path.extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_string().to_lowercase()))
        .unwrap_or_default();
    let file_size = meta.len();

    let created_date = meta.created()
        .map(|t| {
            let dt: chrono::DateTime<chrono::Local> = t.into();
            dt.format("%Y年%m月%d日 %H:%M").to_string()
        })
        .unwrap_or_default();

    let modified_date = meta.modified()
        .map(|t| {
            let dt: chrono::DateTime<chrono::Local> = t.into();
            dt.format("%Y年%m月%d日 %H:%M").to_string()
        })
        .unwrap_or_default();

    let is_video = is_video_file(&file_type);
    let (width, height) = if is_video {
        get_video_dimensions(path).unwrap_or((0, 0))
    } else {
        get_image_dimensions(path).unwrap_or((0, 0))
    };

    let mut result = ImageMetadata {
        width,
        height,
        file_size,
        file_name,
        file_path,
        file_type,
        created_date,
        modified_date,
        is_video,
        ..Default::default()
    };

    if !is_video {
        extract_exif_metadata(path, &mut result);
        extract_xmp_metadata(path, &mut result);
    }

    if is_video {
        result.duration_ms = get_video_duration_ms(path).unwrap_or(0);
    }

    Ok(result)
}

fn get_image_dimensions(path: &Path) -> Result<(u32, u32), String> {
    // Try fast header-only reading for common formats first
    if let Some((w, h)) = read_dimensions_from_header(path) {
        return Ok((w, h));
    }
    // Fallback to full decode
    let img = image::image_dimensions(path).map_err(|e| format!("Failed to get image dimensions: {}", e))?;
    Ok(img)
}

fn read_dimensions_from_header(path: &Path) -> Option<(u32, u32)> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut header = [0u8; 32];
    file.read_exact(&mut header).ok()?;

    // PNG: 8-byte signature + IHDR chunk (width at offset 16, height at offset 20)
    if header[..8] == [137, 80, 78, 71, 13, 10, 26, 10] {
        let w = u32::from_be_bytes([header[16], header[17], header[18], header[19]]);
        let h = u32::from_be_bytes([header[20], header[21], header[22], header[23]]);
        return Some((w, h));
    }

    // JPEG: scan for SOF marker
    if header[0] == 0xFF && header[1] == 0xD8 {
        // Re-read more for JPEG scanning
        let mut file = std::fs::File::open(path).ok()?;
        let mut data = vec![0u8; 65536]; // read first 64KB
        let n = file.read(&mut data).ok()?;
        let data = &data[..n];
        let mut pos = 2;
        while pos + 4 < data.len() {
            if data[pos] != 0xFF { pos += 1; continue; }
            let marker = data[pos + 1];
            // SOF markers
            if (0xC0..=0xC3).contains(&marker) || (0xC5..=0xC7).contains(&marker) || (0xC9..=0xCB).contains(&marker) || (0xCD..=0xCF).contains(&marker) {
                let h = u16::from_be_bytes([data[pos + 5], data[pos + 6]]) as u32;
                let w = u16::from_be_bytes([data[pos + 7], data[pos + 8]]) as u32;
                return Some((w, h));
            }
            let len = u16::from_be_bytes([data[pos + 2], data[pos + 3]]) as usize;
            pos += 2 + len;
        }
    }

    // BMP: width at offset 18, height at offset 22
    if header[..2] == [b'B', b'M'] {
        if let Ok(f) = std::fs::File::open(path) {
            use std::io::Seek;
            let mut f = std::io::BufReader::new(f);
            use std::io::SeekFrom;
            if f.seek(SeekFrom::Start(18)).is_ok() {
                let mut wh = [0u8; 8];
                if f.read_exact(&mut wh).is_ok() {
                    let w = u32::from_le_bytes([wh[0], wh[1], wh[2], wh[3]]);
                    let h = i32::from_le_bytes([wh[4], wh[5], wh[6], wh[7]]).unsigned_abs();
                    return Some((w, h));
                }
            }
        }
    }

    None
}

fn get_video_dimensions(path: &Path) -> Result<(u32, u32), String> {
    // Try to read video dimensions from container headers
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    // For MP4/MOV files, look for tkhd atom
    if data.len() > 8 {
        // Simple approach: look for common video container signatures
        // For a production app, use ffmpeg or similar
        Ok((0, 0))
    } else {
        Ok((0, 0))
    }
}

fn get_video_duration_ms(path: &Path) -> Result<i64, String> {
    let _ = path;
    // Placeholder - would need ffmpeg for accurate duration
    Ok(0)
}

fn extract_exif_metadata(path: &Path, result: &mut ImageMetadata) {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return,
    };
    let mut bufreader = std::io::BufReader::new(file);
    let exif = match exif::Reader::new().read_from_container(&mut bufreader) {
        Ok(e) => e,
        Err(_) => return,
    };

    // DateTimeOriginal
    if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
        result.date_time_original = field.display_value().to_string();
    } else if let Some(field) = exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY) {
        result.date_time_original = field.display_value().to_string();
    }

    // Camera Model
    if let Some(field) = exif.get_field(exif::Tag::Model, exif::In::PRIMARY) {
        result.camera_model = field.display_value().to_string().trim_matches('"').to_string();
    }

    // FNumber
    if let Some(field) = exif.get_field(exif::Tag::FNumber, exif::In::PRIMARY) {
        result.f_number = format!("f/{}", field.display_value());
    }

    // Exposure Time
    if let Some(field) = exif.get_field(exif::Tag::ExposureTime, exif::In::PRIMARY) {
        result.exposure_time = format!("{}s", field.display_value());
    }

    // ISO
    if let Some(field) = exif.get_field(exif::Tag::PhotographicSensitivity, exif::In::PRIMARY) {
        result.iso = format!("ISO{}", field.display_value());
    }

    // Focal Length
    if let Some(field) = exif.get_field(exif::Tag::FocalLength, exif::In::PRIMARY) {
        result.focal_length = format!("{}mm", field.display_value());
    }
}

fn extract_xmp_metadata(path: &Path, result: &mut ImageMetadata) {
    // 读取整个文件以查找 XMP 数据（XMP 可能在文件的任何位置）
    use std::io::Read;
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return,
    };
    let mut data = Vec::new();
    if file.read_to_end(&mut data).is_err() {
        return;
    }
    let data = &data;

    // Search for XMP data in the file
    let xmp_start = b"<x:xmpmeta";
    let xmp_end = b"</x:xmpmeta>";

    let start = data.windows(xmp_start.len())
        .position(|w| w == xmp_start);

    let start = match start {
        Some(s) => s,
        None => return,
    };

    let end = data[start..].windows(xmp_end.len())
        .position(|w| w == xmp_end)
        .map(|e| e + xmp_end.len());

    let end = match end {
        Some(e) => start + e,
        None => return,
    };

    let xmp_str = match std::str::from_utf8(&data[start..end]) {
        Ok(s) => s,
        Err(_) => return,
    };

    // Parse XMP for keywords (dc:subject)
    extract_xmp_keywords(xmp_str, result);

    // Parse XMP for face regions (Microsoft Photo Regions)
    extract_xmp_face_regions(xmp_str, result);
}

fn extract_xmp_keywords(xmp: &str, result: &mut ImageMetadata) {
    // Look for dc:subject bag
    if let Some(subject_start) = xmp.find("<dc:subject") {
        if let Some(bag_start) = xmp[subject_start..].find("<rdf:Bag") {
            let bag_section = &xmp[subject_start + bag_start..];
            if let Some(bag_end) = bag_section.find("</rdf:Bag>") {
                let bag_content = &bag_section[..bag_end];
                // Extract all rdf:li items
                let mut pos = 0;
                while let Some(li_start) = bag_content[pos..].find("<rdf:li") {
                    let li_content = &bag_content[pos + li_start..];
                    if let Some(gt) = li_content.find('>') {
                        let after_gt = &li_content[gt + 1..];
                        if let Some(li_end) = after_gt.find("</rdf:li") {
                            let keyword = after_gt[..li_end].trim().to_string();
                            if !keyword.is_empty() && !result.keywords.contains(&keyword) {
                                result.keywords.push(keyword);
                            }
                        }
                    }
                    pos += li_start + 1;
                }
            }
        }
    }
}

fn extract_xmp_face_regions(xmp: &str, result: &mut ImageMetadata) {
    // 按照母项目的方式解析 Microsoft Photo 1.2 命名空间的人脸区域
    // 命名空间: http://ns.microsoft.com/photo/1.2/
    // RegionInfo: http://ns.microsoft.com/photo/1.2/t/RegionInfo#
    // Region: http://ns.microsoft.com/photo/1.2/t/Region#

    // 方法1: 查找 rdf:Bag 中的 rdf:li 区域条目
    // 查找 MPRI:Regions 或 mwg-rs:Regions 区块
    let region_block_patterns = [
        "MPRI:Regions",
        "mwg-rs:Regions",
        "MP:RegionInfo",
    ];

    for pattern in &region_block_patterns {
        if let Some(block_pos) = xmp.find(pattern) {
            let block = &xmp[block_pos..];

            // 在区块中查找 rdf:Bag
            if let Some(bag_pos) = block.find("<rdf:Bag") {
                let bag = &block[bag_pos..];
                if let Some(bag_end) = bag.find("</rdf:Bag>") {
                    let bag_content = &bag[..bag_end];

                    // 遍历每个 rdf:li 条目
                    let mut li_pos = 0;
                    while let Some(li_start) = bag_content[li_pos..].find("<rdf:li") {
                        let li = &bag_content[li_pos + li_start..];

                        // 查找这个 li 条目的结束
                        let li_end = li.find("</rdf:li>").unwrap_or(li.len());
                        let li_content = &li[..li_end];

                        // 提取人名 - 尝试多种标签
                        let name = extract_xmp_field(li_content, "MP:PersonDisplayName")
                            .or_else(|| extract_xmp_field(li_content, "mwg-rs:Name"))
                            .or_else(|| extract_xmp_field(li_content, "MPReg:PersonDisplayName"));

                        // 提取矩形 - 尝试 MP:Rectangle 标签
                        let rect = extract_xmp_field(li_content, "MP:Rectangle")
                            .or_else(|| extract_xmp_field(li_content, "MPReg:Rectangle"));

                        if let Some(rect_str) = rect {
                            if let Some(region) = parse_face_rect(&rect_str, name) {
                                if !region.name.is_empty() && !result.people.contains(&region.name) {
                                    result.people.push(region.name.clone());
                                }
                                result.face_regions.push(region);
                            }
                        } else {
                            // 尝试从 rdf:Description 属性中提取 stArea 坐标
                            let rect_from_attrs = extract_starea_rect(li_content);
                            if let Some(rect_str) = rect_from_attrs {
                                if let Some(region) = parse_face_rect(&rect_str, name) {
                                    if !region.name.is_empty() && !result.people.contains(&region.name) {
                                        result.people.push(region.name.clone());
                                    }
                                    result.face_regions.push(region);
                                }
                            }
                        }

                        li_pos += li_start + 1;
                    }
                }
            }

            if !result.face_regions.is_empty() {
                return;
            }
        }
    }

    // 方法2: 直接在 rdf:Description 属性中查找 stArea 坐标
    let mut pos = 0;
    while let Some(desc_start) = xmp[pos..].find("<rdf:Description") {
        let desc = &xmp[pos + desc_start..];
        if let Some(desc_end) = desc.find('>') {
            let desc_tag = &desc[..desc_end];

            // 检查是否包含人脸区域相关属性
            if desc_tag.contains("stArea") || desc_tag.contains("MP:Region") {
                let name = extract_attr(desc_tag, "mwg-rs:Name")
                    .or_else(|| extract_attr(desc_tag, "MP:PersonDisplayName"));

                // 尝试 stArea 坐标格式
                let rect = extract_starea_rect(desc_tag)
                    .or_else(|| extract_attr(desc_tag, "MP:Rectangle"));

                if let Some(rect_str) = rect {
                    if let Some(region) = parse_face_rect(&rect_str, name) {
                        if !region.name.is_empty() && !result.people.contains(&region.name) {
                            result.people.push(region.name.clone());
                        }
                        result.face_regions.push(region);
                    }
                }
            }
        }
        pos += desc_start + 1;
    }
}

fn parse_face_rect(rect_str: &str, name: Option<String>) -> Option<FaceRegion> {
    let parts: Vec<&str> = rect_str.split(',').map(|s| s.trim()).collect();
    if parts.len() == 4 {
        if let (Ok(x), Ok(y), Ok(w), Ok(h)) = (
            parts[0].parse::<f64>(),
            parts[1].parse::<f64>(),
            parts[2].parse::<f64>(),
            parts[3].parse::<f64>(),
        ) {
            return Some(FaceRegion {
                name: name.unwrap_or_default(),
                x,
                y,
                width: w,
                height: h,
            });
        }
    }
    None
}

fn extract_starea_rect(xml: &str) -> Option<String> {
    let x = extract_attr(xml, "stArea:x")?;
    let y = extract_attr(xml, "stArea:y")?;
    let w = extract_attr(xml, "stArea:w")?;
    let h = extract_attr(xml, "stArea:h")?;
    Some(format!("{}, {}, {}, {}", x, y, w, h))
}

fn extract_xmp_field(xml: &str, field_name: &str) -> Option<String> {
    // Look for <field_name>value</field_name> or <field_name ...>value</field_name>
    let open_tag = format!("<{}", field_name);
    if let Some(start) = xml.find(&open_tag) {
        let after_tag = &xml[start + open_tag.len()..];
        if let Some(gt) = after_tag.find('>') {
            let after_gt = &after_tag[gt + 1..];
            let close_tag = format!("</{}", field_name);
            if let Some(end) = after_gt.find(&close_tag) {
                return Some(after_gt[..end].trim().to_string());
            }
        }
    }
    // Try attribute style: field_name="value"
    extract_attr(xml, field_name)
}

fn extract_attr(tag: &str, attr_name: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr_name);
    if let Some(start) = tag.find(&pattern) {
        let after = &tag[start + pattern.len()..];
        if let Some(end) = after.find('"') {
            return Some(after[..end].to_string());
        }
    }
    // Also try with single quotes
    let pattern = format!("{}='", attr_name);
    if let Some(start) = tag.find(&pattern) {
        let after = &tag[start + pattern.len()..];
        if let Some(end) = after.find('\'') {
            return Some(after[..end].to_string());
        }
    }
    None
}

pub const IMAGE_EXTENSIONS: &[&str] = &[".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".ico", ".tiff", ".tif"];
pub const VIDEO_EXTENSIONS: &[&str] = &[".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".m4v", ".3gp", ".mts"];

pub fn is_image_file(ext: &str) -> bool {
    IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

pub fn is_video_file(ext: &str) -> bool {
    VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

pub fn is_supported_file(ext: &str) -> bool {
    is_image_file(ext) || is_video_file(ext)
}
