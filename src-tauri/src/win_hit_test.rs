/// Windows WM_NCHITTEST subclass for frameless maximized windows.
///
/// When a Tauri window uses `decorations: false`, Windows still manages an
/// invisible resize border via WS_THICKFRAME. At the top edge of a maximized
/// window, WM_NCHITTEST returns resize/caption hit-test values, causing the
/// OS to display a drag cursor.
///
/// The fix subclasses BOTH the main window AND all its child windows (including
/// WebView2), because the WebView2 child covers the entire parent and intercepts
/// WM_NCHITTEST before it reaches the parent's wndproc.

use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::collections::HashMap;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Mutex;
use tauri::WebviewWindow;
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

// Original wndprocs keyed by HWND (as usize)
static ORIGINAL_PROCS: Mutex<Option<HashMap<usize, isize>>> = Mutex::new(None);
static PARENT_HWND: AtomicIsize = AtomicIsize::new(0);

/// Install the WM_NCHITTEST subclass on the given Tauri window and all children.
pub fn install_hit_test_subclass(window: &WebviewWindow) {
    let hwnd = match get_hwnd(window) {
        Some(h) => h,
        None => return,
    };

    *ORIGINAL_PROCS.lock().unwrap() = Some(HashMap::new());
    PARENT_HWND.store(hwnd as isize, Ordering::SeqCst);

    // Subclass the parent window
    subclass_hwnd(hwnd);

    // Enumerate and subclass all child windows (WebView2 etc.)
    let mut children: Vec<HWND> = Vec::new();
    let children_ptr = &mut children as *mut Vec<HWND> as LPARAM;
    unsafe {
        EnumChildWindows(hwnd, Some(enum_child_proc), children_ptr);
    }
    for &child in &children {
        subclass_hwnd(child);
    }
}

fn subclass_hwnd(hwnd: HWND) {
    let prev = unsafe {
        SetWindowLongPtrW(hwnd, GWLP_WNDPROC, custom_wndproc as *const () as isize)
    };
    if prev != 0 {
        if let Ok(mut map) = ORIGINAL_PROCS.lock() {
            if let Some(ref mut m) = *map {
                m.insert(hwnd as usize, prev);
            }
        }
    }
}

unsafe extern "system" fn enum_child_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let children = &mut *(lparam as *mut Vec<HWND>);
    children.push(hwnd);
    1 // continue enumeration
}

fn get_hwnd(window: &WebviewWindow) -> Option<HWND> {
    let handle = window.window_handle().ok()?;
    match handle.as_raw() {
        RawWindowHandle::Win32(h) => Some(h.hwnd.get() as *mut std::ffi::c_void),
        _ => None,
    }
}

fn is_parent_maximized() -> bool {
    let parent = PARENT_HWND.load(Ordering::SeqCst);
    if parent == 0 {
        return false;
    }
    unsafe {
        let style = GetWindowLongW(parent as HWND, GWL_STYLE) as u32;
        (style & WS_MAXIMIZE) != 0
    }
}

fn get_original_proc(hwnd: HWND) -> isize {
    if let Ok(map) = ORIGINAL_PROCS.lock() {
        if let Some(ref m) = *map {
            return m.get(&(hwnd as usize)).copied().unwrap_or(0);
        }
    }
    0
}

type WndProcFn = unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT;

fn call_original(original: isize, hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if original != 0 {
        unsafe {
            CallWindowProcW(
                Some(std::mem::transmute::<isize, WndProcFn>(original)),
                hwnd, msg, wparam, lparam,
            )
        }
    } else {
        unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
    }
}

unsafe extern "system" fn custom_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    let original = get_original_proc(hwnd);

    if msg == WM_NCHITTEST {
        let default_result = call_original(original, hwnd, msg, wparam, lparam);

        if is_parent_maximized() {
            match default_result as u32 {
                HTTOP | HTTOPLEFT | HTTOPRIGHT | HTLEFT | HTRIGHT
                | HTBOTTOM | HTBOTTOMLEFT | HTBOTTOMRIGHT | HTCAPTION => {
                    return HTCLIENT as LRESULT;
                }
                _ => return default_result,
            }
        }

        return default_result;
    }

    call_original(original, hwnd, msg, wparam, lparam)
}
