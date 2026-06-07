use crate::domain::GameStatus;
use crate::storage::{load_state, resolve_required_celeste_path_from_state};
use std::collections::HashSet;
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
    let targets = game_executable_targets(&path);
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
        if !targets.contains(&process_exe) {
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
    let pid = running_game_process_ids(celeste_path).into_iter().next();
    GameStatus {
        running: pid.is_some(),
        stopped,
        executable,
        pid,
    }
}

fn running_game_process_ids(celeste_path: &Path) -> Vec<u32> {
    let targets = game_executable_targets(celeste_path);
    if targets.is_empty() {
        return vec![];
    }

    let mut system = System::new_all();
    system.refresh_processes();
    system
        .processes()
        .values()
        .filter_map(|process| {
            let process_exe = process.exe()?.canonicalize().ok()?;
            targets
                .contains(&process_exe)
                .then_some(process.pid().as_u32())
        })
        .collect()
}

fn game_executable_targets(celeste_path: &Path) -> HashSet<PathBuf> {
    ["Celeste.exe", "Celeste", "Celeste.bin.x86_64"]
        .iter()
        .filter_map(|name| celeste_path.join(name).canonicalize().ok())
        .collect()
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
    use super::split_launch_args;

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
