use crate::storage::{load_state, resolve_required_celeste_path_from_state, AppState};
use std::path::PathBuf;

pub async fn run_blocking<T, F>(task_label: &'static str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("{task_label}：{error}"))?
}

pub async fn run_with_celeste_path<T, F>(
    celeste_path: String,
    task_label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(PathBuf, AppState) -> Result<T, String> + Send + 'static,
{
    run_blocking(task_label, move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        task(path, state)
    })
    .await
}
