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
            commands::set_auto_backup_cleanup_enabled,
            commands::set_auto_backup_retention_count,
            commands::set_mod_catalog_sources,
            commands::set_auto_check_mod_updates_on_startup,
            commands::set_selected_save_files,
            commands::select_celeste_directory,
            commands::scan_celeste,
            commands::rescan_celeste,
            commands::search_mod_catalog,
            commands::check_mod_updates,
            commands::preview_mod_update_metadata,
            commands::list_everest_releases,
            commands::install_everest,
            commands::install_mod,
            commands::update_mod,
            commands::cancel_mod_download,
            commands::set_record_favorite,
            commands::set_record_protected,
            commands::save_profile,
            commands::delete_profile,
            commands::apply_profile,
            commands::launch_profile,
            commands::launch_game,
            commands::create_backup,
            commands::list_backups,
            commands::restore_backup,
            commands::delete_backup,
            commands::cleanup_auto_backups,
            commands::open_backup_folder,
            commands::open_backup_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
