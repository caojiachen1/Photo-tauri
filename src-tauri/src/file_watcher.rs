use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, atomic::{AtomicBool, Ordering}};
use tauri::{AppHandle, Emitter};

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    running: Arc<AtomicBool>,
}

impl Drop for FileWatcher {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

impl FileWatcher {
    pub fn new(path: &str, app_handle: AppHandle) -> Result<Self, String> {
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        let mut watcher = RecommendedWatcher::new(
            tx,
            Config::default(),
        ).map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher.watch(PathBuf::from(path).as_path(), RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        let app_handle_clone = app_handle.clone();
        std::thread::spawn(move || {
            let mut debounce_timer = std::time::Instant::now();
            while running_clone.load(Ordering::SeqCst) {
                match rx.recv_timeout(std::time::Duration::from_millis(500)) {
                    Ok(Ok(event)) => {
                        match event.kind {
                            EventKind::Create(_)
                            | EventKind::Remove(_)
                            | EventKind::Modify(_) => {
                                if debounce_timer.elapsed() > std::time::Duration::from_millis(200) {
                                    debounce_timer = std::time::Instant::now();
                                    let _ = app_handle_clone.emit("files-changed", ());
                                }
                            }
                            _ => {}
                        }
                    }
                    Ok(Err(_)) => {}
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        Ok(FileWatcher { _watcher: watcher, running })
    }
}
