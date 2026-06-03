use std::collections::HashMap;

pub fn read_dialog_titles(mut files: Vec<(String, String)>) -> HashMap<String, String> {
    files.sort_by(|a, b| dialog_language_score(&b.0).cmp(&dialog_language_score(&a.0)));
    let mut titles = HashMap::new();
    for (_, text) in files {
        let mut pending_key: Option<String> = None;
        for line in text.lines() {
            let line = line.trim_start_matches('\u{feff}').trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
                continue;
            }
            let Some((key, value)) = line.split_once('=') else {
                if let Some(key) = pending_key.take() {
                    titles
                        .entry(key)
                        .or_insert_with(|| clean_dialog_value(line));
                }
                continue;
            };
            let key = normalize_dialog_key(key);
            let value = value.trim().trim_matches('"').to_string();
            if key.is_empty() {
                continue;
            }
            if value.is_empty() {
                pending_key = Some(key);
                continue;
            }
            pending_key = None;
            titles.entry(key).or_insert(value);
        }
    }
    titles
}

pub fn dialog_title_for_sid(sid: &str, titles: &HashMap<String, String>) -> Option<String> {
    for key in dialog_key_candidates(sid) {
        if let Some(value) = dialog_title_for_key(&key, titles) {
            return Some(value.clone());
        }
    }
    None
}

pub fn dialog_title_for_key(key: &str, titles: &HashMap<String, String>) -> Option<String> {
    titles.get(&normalize_dialog_key(key)).cloned()
}

fn clean_dialog_value(value: &str) -> String {
    value.trim().trim_matches('"').to_string()
}

fn dialog_language_score(path: &str) -> u8 {
    let lower = path.to_lowercase();
    if lower.contains("chinesesimplified")
        || lower.contains("simplifiedchinese")
        || lower.contains("schinese")
        || lower.contains("zh-cn")
        || lower.contains("zh_hans")
        || lower.contains("zh-hans")
        || lower.contains("chinese")
    {
        100
    } else if lower.contains("zh-tw")
        || lower.contains("zh_hant")
        || lower.contains("zh-hant")
        || lower.contains("traditionalchinese")
        || lower.contains("tchinese")
    {
        90
    } else if lower.contains("english") || lower.contains("/en") {
        10
    } else {
        1
    }
}

fn dialog_key_candidates(sid: &str) -> Vec<String> {
    let underscore = sid.replace('/', "_");
    let dot = sid.replace('/', ".");
    vec![
        sid.to_string(),
        underscore.clone(),
        dot.clone(),
        format!("area_{sid}"),
        format!("area_{underscore}"),
        format!("area_{dot}"),
        format!("area_{sid}_name"),
        format!("area_{underscore}_name"),
        format!("area_{dot}_name"),
        format!("{sid}_name"),
        format!("{underscore}_name"),
        format!("{dot}_name"),
    ]
}

fn normalize_dialog_key(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_chinese_titles_and_multiline_values() {
        let titles = read_dialog_titles(vec![
            (
                "Dialog/English.txt".to_string(),
                "area_pack_map_name=English".to_string(),
            ),
            (
                "Dialog/ChineseSimplified.txt".to_string(),
                "area_pack_map_name=\n中文标题".to_string(),
            ),
        ]);

        assert_eq!(
            dialog_title_for_sid("pack/map", &titles),
            Some("中文标题".to_string())
        );
    }
}
