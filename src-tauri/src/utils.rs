pub fn now_string() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    now.to_string()
}

pub fn stable_id(value: &str) -> String {
    let mut hash = 14_695_981_039_346_656_037u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    format!("{hash:016x}")
}

pub fn normalize_slash(value: &str) -> String {
    value
        .replace('\\', "/")
        .trim_start_matches('/')
        .trim()
        .to_string()
}

pub fn normalize_dependency_name(value: &str) -> String {
    let mut normalized = value.replace('\\', "/").replace(['_', '-'], " ");
    normalized = normalized.trim().to_string();
    if normalized.to_ascii_lowercase().ends_with(".zip") {
        normalized.truncate(normalized.len() - 4);
    }
    normalized
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_dependency_names_like_the_frontend() {
        assert_eq!(
            normalize_dependency_name("  Some_Mod-Name.ZIP  "),
            "some mod name"
        );
        assert_eq!(
            normalize_dependency_name("Mods\\Helper Pack"),
            "mods/helper pack"
        );
        assert_eq!(normalize_dependency_name(" \t\n "), "");
    }
}
