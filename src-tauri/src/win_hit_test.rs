use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::collections::HashMap;
use std::sync::LazyLock;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Mutex;
use tauri::WebviewWindow;
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

const TITLEBAR_HEIGHT: i32 = 48;
const WINDOW_CONTROLS_WIDTH: i32 = 138;

static ORIGINAL_PROCS: LazyLock<Mutex<HashMap<usize, isize>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static PARENT_HWND: AtomicIsize = AtomicIsize::new(0);

/// Install a hit-test subclass on the top-level window only.
pub fn install_hit_test_subclass(window: &WebviewWindow) {
    let hwnd = match get_hwnd(window) {
        Some(h) => h,
        None => return,
    };

    PARENT_HWND.store(hwnd as isize, Ordering::SeqCst);
    subclass_hwnd(hwnd);

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
    let current = unsafe { GetWindowLongPtrW(hwnd, GWLP_WNDPROC) };
    if current == custom_wndproc as *const () as isize {
        return;
    }

    let prev = unsafe {
        SetWindowLongPtrW(hwnd, GWLP_WNDPROC, custom_wndproc as *const () as isize)
    };
    if prev != 0 {
        if let Ok(mut map) = ORIGINAL_PROCS.lock() {
            map.entry(hwnd as usize).or_insert(prev);
        }
    }
}

unsafe extern "system" fn enum_child_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let children = &mut *(lparam as *mut Vec<HWND>);
    children.push(hwnd);
    1
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
        return map.get(&(hwnd as usize)).copied().unwrap_or(0);
    }
    0
}

type WndProcFn = unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT;

fn call_original(original: isize, hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if original != 0 {
        unsafe {
            CallWindowProcW(
                Some(std::mem::transmute::<isize, WndProcFn>(original)),
                hwnd,
                msg,
                wparam,
                lparam,
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
            let x = (lparam as i16) as i32;
            let y = ((lparam >> 16) as i16) as i32;
            let mut rect: RECT = std::mem::zeroed();
            GetWindowRect(hwnd, &mut rect);

            let in_window_controls =
                x >= rect.right - WINDOW_CONTROLS_WIDTH
                    && x < rect.right
                    && y >= rect.top
                    && y < rect.top + TITLEBAR_HEIGHT;

            match default_result as u32 {
                HTTOP | HTTOPLEFT | HTTOPRIGHT | HTLEFT | HTRIGHT
                | HTBOTTOM | HTBOTTOMLEFT | HTBOTTOMRIGHT => return HTCLIENT as LRESULT,
                HTCAPTION if in_window_controls => return HTCLIENT as LRESULT,
                _ => return default_result,
            }
        }

        return default_result;
    }

    call_original(original, hwnd, msg, wparam, lparam)
}
