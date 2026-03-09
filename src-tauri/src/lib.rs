pub mod commands;
mod desktop_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    desktop_commands::register_desktop_commands()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
