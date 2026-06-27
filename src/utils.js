import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';

export { invoke, listen, convertFileSrc };

// Format file size
export function formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    let order = 0;
    let size = bytes;
    while (size >= 1024 && order < sizes.length - 1) {
        order++;
        size /= 1024;
    }
    return `${size.toFixed(2)} ${sizes[order]}`;
}

// Format time (ms to HH:MM:SS)
export function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Get file extension
export function getFileExtension(path) {
    const parts = path.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1].toLowerCase()}` : '';
}

// Get file name from path
export function getFileName(path) {
    return path.split(/[/\\]/).pop() || '';
}

// Get directory from path
export function getDirectory(path) {
    const parts = path.split(/[/\\]/);
    parts.pop();
    return parts.join('/');
}

// Debounce function
export function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Throttle function
export function throttle(fn, limit) {
    let inThrottle = false;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Check if file is image
export function isImageFile(ext) {
    const imageExts = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp', '.ico', '.tiff', '.tif'];
    return imageExts.includes(ext.toLowerCase());
}

// Check if file is video
export function isVideoFile(ext) {
    const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.mts'];
    return videoExts.includes(ext.toLowerCase());
}

// Check if file is supported
export function isSupportedFile(ext) {
    return isImageFile(ext) || isVideoFile(ext);
}
