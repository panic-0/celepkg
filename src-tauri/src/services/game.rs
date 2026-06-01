use std::path::Path;

pub fn resolve_game_executable(celeste_path: &Path) -> String {
    ["Celeste.exe", "Celeste", "Celeste.bin.x86_64"]
        .iter()
        .map(|name| celeste_path.join(name))
        .find(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

pub fn split_launch_args(args: &str) -> Vec<String> {
    args.split_whitespace().map(ToString::to_string).collect()
}
