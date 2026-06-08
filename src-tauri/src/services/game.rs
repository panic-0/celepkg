use crate::domain::{GameStatus, GameStatusPhase};
use crate::storage::{load_state, resolve_required_celeste_path_from_state};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;
use sysinfo::System;

pub fn resolve_game_executable(celeste_path: &Path) -> String {
    ["Celeste.exe", "Celeste", "Celeste.bin.x86_64"]
        .iter()
        .map(|name| celeste_path.join(name))
        .find(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

pub fn game_status(celeste_path: String) -> Result<GameStatus, String> {
    let state = load_state()?;
    let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
    Ok(game_status_for_path(&path, false))
}

pub fn stop_game(celeste_path: String) -> Result<GameStatus, String> {
    let state = load_state()?;
    let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
    let targets = managed_executable_targets(&path);
    if targets.is_empty() {
        return Ok(game_status_for_path(&path, false));
    }

    let mut system = System::new_all();
    system.refresh_processes();
    let mut stopped = false;
    let mut failed = vec![];
    let mut matched = false;
    for process in system.processes().values() {
        let Some(process_exe) = process.exe().and_then(|path| path.canonicalize().ok()) else {
            continue;
        };
        if !targets.contains_key(&process_exe) {
            continue;
        }
        matched = true;
        let pid = process.pid().as_u32();
        if process.kill() {
            stopped = true;
        } else {
            failed.push(pid);
        }
    }
    if !matched {
        return Ok(game_status_for_path(&path, false));
    }
    if !failed.is_empty() {
        return Err(format!(
            "停止 Celeste 失败，无法结束进程：{}",
            failed
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join("、")
        ));
    }

    thread::sleep(Duration::from_millis(300));
    Ok(game_status_for_path(&path, stopped))
}

fn game_status_for_path(celeste_path: &Path, stopped: bool) -> GameStatus {
    let executable = resolve_game_executable(celeste_path);
    let processes = game_process_snapshots(celeste_path);
    classify_game_status(
        &executable,
        stopped,
        &processes,
        window_detection_supported(),
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ManagedProcessKind {
    Celeste,
    EverestSplash,
}

#[derive(Debug, Clone)]
struct GameProcessSnapshot {
    pid: u32,
    executable: String,
    kind: ManagedProcessKind,
    window_titles: Vec<String>,
}

fn classify_game_status(
    executable: &str,
    stopped: bool,
    processes: &[GameProcessSnapshot],
    window_detection_available: bool,
) -> GameStatus {
    let first_process = processes.first();
    let pid = first_process.map(|process| process.pid);
    let process_executable = first_process
        .map(|process| process.executable.clone())
        .unwrap_or_else(|| executable.to_string());

    if processes.is_empty() {
        return GameStatus {
            running: false,
            busy: false,
            stopped,
            executable: process_executable,
            pid: None,
            phase: GameStatusPhase::Idle,
            detail: String::new(),
            window_title: String::new(),
        };
    }

    if let Some(process) = processes
        .iter()
        .find(|process| process.kind == ManagedProcessKind::EverestSplash)
    {
        let title = first_window_title(process);
        return GameStatus {
            running: false,
            busy: true,
            stopped,
            executable: process.executable.clone(),
            pid: Some(process.pid),
            phase: GameStatusPhase::EverestPreparing,
            detail: everest_preparing_detail(&title)
                .unwrap_or_else(|| "Everest 正在准备 Celeste".to_string()),
            window_title: title,
        };
    }

    if let Some((process, title, detail)) = processes.iter().find_map(|process| {
        process.window_titles.iter().find_map(|title| {
            everest_preparing_detail(title).map(|detail| (process, title.clone(), detail))
        })
    }) {
        return GameStatus {
            running: false,
            busy: true,
            stopped,
            executable: process.executable.clone(),
            pid: Some(process.pid),
            phase: GameStatusPhase::EverestPreparing,
            detail,
            window_title: title,
        };
    }

    if !window_detection_available {
        return GameStatus {
            running: true,
            busy: true,
            stopped,
            executable: process_executable,
            pid,
            phase: GameStatusPhase::Running,
            detail: "Celeste 正在运行".to_string(),
            window_title: first_process
                .and_then(first_window_title_opt)
                .unwrap_or_default(),
        };
    }

    if let Some(process) = processes.iter().find(|process| {
        process.kind == ManagedProcessKind::Celeste && process.window_titles.is_empty()
    }) {
        return GameStatus {
            running: false,
            busy: true,
            stopped,
            executable: process.executable.clone(),
            pid: Some(process.pid),
            phase: GameStatusPhase::ProcessStarting,
            detail: "Celeste 正在启动".to_string(),
            window_title: String::new(),
        };
    }

    GameStatus {
        running: true,
        busy: true,
        stopped,
        executable: process_executable,
        pid,
        phase: GameStatusPhase::Running,
        detail: "Celeste 正在运行".to_string(),
        window_title: first_process
            .and_then(first_window_title_opt)
            .unwrap_or_default(),
    }
}

fn game_process_snapshots(celeste_path: &Path) -> Vec<GameProcessSnapshot> {
    let targets = managed_executable_targets(celeste_path);
    if targets.is_empty() {
        return vec![];
    }

    let mut system = System::new_all();
    system.refresh_processes();
    let windows_by_pid = window_titles_by_pid();
    system
        .processes()
        .values()
        .filter_map(|process| {
            let process_exe = process.exe()?.canonicalize().ok()?;
            let kind = targets.get(&process_exe)?;
            let pid = process.pid().as_u32();
            Some(GameProcessSnapshot {
                pid,
                executable: process_exe.to_string_lossy().to_string(),
                kind: *kind,
                window_titles: windows_by_pid.get(&pid).cloned().unwrap_or_default(),
            })
        })
        .collect()
}

fn game_executable_targets(celeste_path: &Path) -> HashSet<PathBuf> {
    ["Celeste.exe", "Celeste", "Celeste.bin.x86_64"]
        .iter()
        .filter_map(|name| celeste_path.join(name).canonicalize().ok())
        .collect()
}

fn managed_executable_targets(celeste_path: &Path) -> HashMap<PathBuf, ManagedProcessKind> {
    let mut targets = HashMap::new();
    for path in game_executable_targets(celeste_path) {
        targets.insert(path, ManagedProcessKind::Celeste);
    }
    for path in everest_splash_executable_targets(celeste_path) {
        targets.insert(path, ManagedProcessKind::EverestSplash);
    }
    targets
}

fn everest_splash_executable_targets(celeste_path: &Path) -> Vec<PathBuf> {
    [
        celeste_path.join("EverestSplash.exe"),
        celeste_path.join("EverestSplash"),
        celeste_path
            .join("EverestSplash")
            .join("EverestSplash-win.exe"),
        celeste_path
            .join("EverestSplash")
            .join("EverestSplash-win64.exe"),
        celeste_path
            .join("EverestSplash")
            .join("EverestSplash-linux"),
        celeste_path.join("EverestSplash").join("EverestSplash-osx"),
    ]
    .into_iter()
    .filter_map(|path| path.canonicalize().ok())
    .collect()
}

fn first_window_title(process: &GameProcessSnapshot) -> String {
    first_window_title_opt(process).unwrap_or_default()
}

fn first_window_title_opt(process: &GameProcessSnapshot) -> Option<String> {
    process
        .window_titles
        .iter()
        .find(|title| !title.trim().is_empty())
        .cloned()
}

fn everest_preparing_detail(title: &str) -> Option<String> {
    let normalized = title.to_ascii_lowercase();
    if !(normalized.contains("everest")
        || normalized.contains("loading")
        || normalized.contains("mod "))
    {
        return None;
    }

    if let Some(progress) = parse_mod_progress(title) {
        return Some(format!("Everest 正在加载 Mod {progress}"));
    }
    Some("Everest 正在准备 Celeste".to_string())
}

fn parse_mod_progress(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    for index in 0..bytes.len() {
        if bytes[index] != b'/' {
            continue;
        }
        let left_start = scan_digits_left(bytes, index)?;
        let right_end = scan_digits_right(bytes, index + 1)?;
        let left = text.get(left_start..index)?.trim();
        let right = text.get(index + 1..right_end)?.trim();
        if !left.is_empty() && !right.is_empty() {
            return Some(format!("{left}/{right}"));
        }
    }
    None
}

fn scan_digits_left(bytes: &[u8], slash_index: usize) -> Option<usize> {
    let mut index = slash_index;
    while index > 0 && bytes[index - 1].is_ascii_whitespace() {
        index -= 1;
    }
    let end = index;
    while index > 0 && bytes[index - 1].is_ascii_digit() {
        index -= 1;
    }
    (index < end).then_some(index)
}

fn scan_digits_right(bytes: &[u8], start_index: usize) -> Option<usize> {
    let mut index = start_index;
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    let start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    (index > start).then_some(index)
}

#[cfg(target_os = "windows")]
fn window_detection_supported() -> bool {
    true
}

#[cfg(not(target_os = "windows"))]
fn window_detection_supported() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn window_titles_by_pid() -> HashMap<u32, Vec<String>> {
    use windows_sys::Win32::Foundation::{HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
        IsWindowVisible,
    };

    unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> i32 {
        let windows = &mut *(lparam as *mut HashMap<u32, Vec<String>>);
        if unsafe { IsWindowVisible(hwnd) } == 0 {
            return 1;
        }

        let length = unsafe { GetWindowTextLengthW(hwnd) };
        if length <= 0 {
            return 1;
        }

        let mut pid = 0_u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if pid == 0 {
            return 1;
        }

        let mut buffer = vec![0_u16; length as usize + 1];
        let copied = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
        if copied > 0 {
            let title = String::from_utf16_lossy(&buffer[..copied as usize]);
            windows.entry(pid).or_default().push(title);
        }
        1
    }

    let mut windows = HashMap::new();
    unsafe {
        EnumWindows(Some(enum_window), &mut windows as *mut _ as LPARAM);
    }
    windows
}

#[cfg(not(target_os = "windows"))]
fn window_titles_by_pid() -> HashMap<u32, Vec<String>> {
    HashMap::new()
}

pub fn split_launch_args(args: &str) -> Vec<String> {
    let mut result = vec![];
    let mut current = String::new();
    let mut quote = None;
    let mut arg_started = false;
    let mut chars = args.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(next) = chars.peek().copied() {
                let escapes_in_quote =
                    quote.is_some_and(|active_quote| next == active_quote || next == '\\');
                let escapes_outside_quote = quote.is_none()
                    && (next == '"' || next == '\'' || next == '\\' || next.is_whitespace());
                if escapes_in_quote || escapes_outside_quote {
                    current.push(next);
                    chars.next();
                } else {
                    current.push(ch);
                }
            } else {
                current.push(ch);
            }
            arg_started = true;
            continue;
        }

        if let Some(active_quote) = quote {
            if ch == active_quote {
                quote = None;
            } else {
                current.push(ch);
            }
            arg_started = true;
            continue;
        }

        if ch == '"' || ch == '\'' {
            quote = Some(ch);
            arg_started = true;
            continue;
        }

        if ch.is_whitespace() {
            if arg_started {
                result.push(std::mem::take(&mut current));
                arg_started = false;
            }
            continue;
        }

        current.push(ch);
        arg_started = true;
    }

    if arg_started {
        result.push(current);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn process(pid: u32, kind: ManagedProcessKind, window_titles: &[&str]) -> GameProcessSnapshot {
        GameProcessSnapshot {
            pid,
            executable: format!("D:\\Games\\Celeste\\{kind:?}.exe"),
            kind,
            window_titles: window_titles
                .iter()
                .map(|title| title.to_string())
                .collect(),
        }
    }

    fn status(processes: &[GameProcessSnapshot], window_detection_available: bool) -> GameStatus {
        classify_game_status(
            "D:\\Games\\Celeste\\Celeste.exe",
            false,
            processes,
            window_detection_available,
        )
    }

    #[test]
    fn classifies_no_game_process_as_idle() {
        let status = status(&[], true);

        assert_eq!(status.phase, GameStatusPhase::Idle);
        assert!(!status.running);
        assert!(!status.busy);
    }

    #[test]
    fn classifies_everest_splash_as_preparing() {
        let status = status(
            &[process(12, ManagedProcessKind::EverestSplash, &["Everest"])],
            true,
        );

        assert_eq!(status.phase, GameStatusPhase::EverestPreparing);
        assert!(!status.running);
        assert!(status.busy);
        assert_eq!(status.detail, "Everest 正在准备 Celeste");
    }

    #[test]
    fn classifies_everest_mod_progress_window_as_preparing() {
        let status = status(
            &[process(
                12,
                ManagedProcessKind::Celeste,
                &["Everest Loading Mods 12/87"],
            )],
            true,
        );

        assert_eq!(status.phase, GameStatusPhase::EverestPreparing);
        assert_eq!(status.detail, "Everest 正在加载 Mod 12/87");
        assert_eq!(status.window_title, "Everest Loading Mods 12/87");
    }

    #[test]
    fn classifies_celeste_process_without_window_as_starting() {
        let status = status(&[process(12, ManagedProcessKind::Celeste, &[])], true);

        assert_eq!(status.phase, GameStatusPhase::ProcessStarting);
        assert!(!status.running);
        assert!(status.busy);
    }

    #[test]
    fn classifies_celeste_window_as_running() {
        let status = status(
            &[process(12, ManagedProcessKind::Celeste, &["Celeste"])],
            true,
        );

        assert_eq!(status.phase, GameStatusPhase::Running);
        assert!(status.running);
        assert!(status.busy);
    }

    #[test]
    fn non_windows_fallback_treats_celeste_process_as_running() {
        let status = status(&[process(12, ManagedProcessKind::Celeste, &[])], false);

        assert_eq!(status.phase, GameStatusPhase::Running);
        assert!(status.running);
    }

    #[test]
    fn managed_targets_include_nested_windows_everest_splash() {
        let root = tempfile::tempdir().expect("temp celeste dir");
        fs::write(root.path().join("Celeste.exe"), "").expect("write celeste");
        let splash_dir = root.path().join("EverestSplash");
        fs::create_dir_all(&splash_dir).expect("create splash dir");
        fs::write(splash_dir.join("EverestSplash-win64.exe"), "").expect("write splash");

        let targets = managed_executable_targets(root.path());
        let celeste = root
            .path()
            .join("Celeste.exe")
            .canonicalize()
            .expect("canonical celeste");
        let splash = splash_dir
            .join("EverestSplash-win64.exe")
            .canonicalize()
            .expect("canonical splash");

        assert_eq!(targets.get(&celeste), Some(&ManagedProcessKind::Celeste));
        assert_eq!(
            targets.get(&splash),
            Some(&ManagedProcessKind::EverestSplash)
        );
    }

    #[test]
    fn split_launch_args_handles_plain_arguments() {
        assert_eq!(
            split_launch_args("--debug --foo=bar"),
            vec!["--debug", "--foo=bar"]
        );
    }

    #[test]
    fn split_launch_args_keeps_quoted_spaces() {
        assert_eq!(
            split_launch_args(r#"--path "D:\Games\Celeste Mods\pack.zip" 'two words'"#),
            vec!["--path", r#"D:\Games\Celeste Mods\pack.zip"#, "two words"]
        );
    }

    #[test]
    fn split_launch_args_preserves_empty_quoted_argument() {
        assert_eq!(
            split_launch_args(r#"--name "" end"#),
            vec!["--name", "", "end"]
        );
    }

    #[test]
    fn split_launch_args_accepts_unclosed_quote() {
        assert_eq!(
            split_launch_args(r#"--path "D:\Games\Celeste Mods"#),
            vec!["--path", r#"D:\Games\Celeste Mods"#]
        );
    }

    #[test]
    fn split_launch_args_supports_escaped_quotes_and_spaces() {
        assert_eq!(
            split_launch_args(r#"--name \"Spring Collab\" loose\ value"#),
            vec!["--name", "\"Spring", "Collab\"", "loose value"]
        );
    }
}
