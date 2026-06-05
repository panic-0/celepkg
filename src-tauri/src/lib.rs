mod commands;
mod domain;
mod parsers;
mod services;
mod storage;
mod utils;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::set_celeste_path,
            commands::config::set_auto_backup_enabled,
            commands::config::set_auto_backup_cleanup_enabled,
            commands::config::set_auto_backup_retention_count,
            commands::config::set_mod_catalog_sources,
            commands::config::set_auto_check_mod_updates_on_startup,
            commands::config::set_auto_refresh_mod_catalog_cache_on_startup,
            commands::config::set_selected_save_files,
            commands::config::select_celeste_directory,
            commands::scan::scan_celeste,
            commands::scan::rescan_celeste,
            commands::catalog::search_mod_catalog,
            commands::catalog::refresh_mod_catalog_cache,
            commands::catalog::check_mod_updates,
            commands::catalog::preview_mod_update_metadata,
            commands::catalog::list_everest_releases,
            commands::downloads::download_everest_to_staging,
            commands::downloads::install_staged_everest,
            commands::downloads::download_mod_to_staging,
            commands::downloads::install_staged_mod,
            commands::downloads::cancel_mod_download,
            commands::records::set_record_favorite,
            commands::records::set_record_protected,
            commands::profiles::save_profile,
            commands::profiles::delete_profile,
            commands::profiles::apply_profile,
            commands::profiles::launch_profile,
            commands::profiles::launch_game,
            commands::backups::create_backup,
            commands::backups::list_backups,
            commands::backups::restore_backup,
            commands::backups::delete_backup,
            commands::backups::cleanup_auto_backups,
            commands::backups::open_backup_folder,
            commands::backups::open_backup_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
