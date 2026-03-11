#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

fn get_repo_root() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    exe.ancestors().nth(4).unwrap_or(&exe).to_path_buf()
}

fn get_bundle_dir() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    exe.parent().unwrap_or(&exe).to_path_buf()
}

fn start_python_server() {
    let is_dev = cfg!(debug_assertions);

    if is_dev {
        let repo_root = get_repo_root();
        let server_path = repo_root.join("src").join("server.py");

        #[cfg(target_os = "windows")]
        let _ = Command::new("python")
            .arg(&server_path)
            .current_dir(&repo_root)
            .spawn();

        #[cfg(not(target_os = "windows"))]
        let _ = Command::new("python3")
            .arg(&server_path)
            .current_dir(&repo_root)
            .spawn();
    } else {
        let bundle_dir = get_bundle_dir();
        let exe_name = if cfg!(target_os = "windows") {
            "triur-brain.exe"
        } else {
            "triur-brain"
        };
        let brain_path = bundle_dir.join("triur-brain").join(exe_name);
        let brain_dir = brain_path.parent().unwrap_or(&bundle_dir);
        let _ = Command::new(&brain_path).current_dir(brain_dir).spawn();
    }
}

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn maximize_window(window: tauri::Window) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn close_window(window: tauri::Window) {
    let _ = window.close();
}

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            start_python_server();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            minimize_window,
            maximize_window,
            close_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
