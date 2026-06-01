mod commands;
mod domain;
mod parsers;
mod services;
mod storage;
mod utils;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::set_celeste_path,
            commands::scan_celeste,
            commands::set_record_favorite,
            commands::set_record_protected,
            commands::save_profile,
            commands::apply_profile,
            commands::launch_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
