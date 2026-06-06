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
