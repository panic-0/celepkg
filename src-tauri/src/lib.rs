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
            commands::set_auto_backup_enabled,
            commands::set_selected_save_files,
            commands::scan_celeste,
            commands::set_record_favorite,
            commands::set_record_protected,
            commands::save_profile,
            commands::apply_profile,
            commands::launch_profile,
            commands::create_backup,
            commands::list_backups,
            commands::restore_backup,
            commands::open_backup_folder,
            commands::open_backup_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
