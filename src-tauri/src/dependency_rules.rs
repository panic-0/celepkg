use crate::domain::ModRecord;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet, VecDeque};

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

pub fn is_builtin_dependency_name(name: &str) -> bool {
    let normalized = normalize_builtin_dependency_name(name);
    normalized.starts_with("everest")
        || matches!(
            normalized.as_str(),
            "celeste" | "monocle" | "fna" | "dotnet" | "netframework" | "microsoftnetframework"
        )
}

pub fn version_too_low(installed_version: &str, required_version: &str) -> bool {
    let Some(installed) = parse_numeric_version(installed_version) else {
        return false;
    };
    let Some(required) = parse_numeric_version(required_version) else {
        return false;
    };
    compare_numeric_versions(&installed, &required) == Ordering::Less
}

pub fn parse_numeric_version(value: &str) -> Option<Vec<u64>> {
    let mut parts = vec![];
    let mut current = String::new();
    for ch in value.chars() {
        if ch.is_ascii_digit() {
            current.push(ch);
        } else if !current.is_empty() {
            parts.push(current.parse().ok()?);
            current.clear();
        }
    }
    if !current.is_empty() {
        parts.push(current.parse().ok()?);
    }
    (!parts.is_empty()).then_some(parts)
}

pub fn compare_numeric_versions(left: &[u64], right: &[u64]) -> Ordering {
    for index in 0..left.len().max(right.len()) {
        let left_part = left.get(index).copied().unwrap_or_default();
        let right_part = right.get(index).copied().unwrap_or_default();
        match left_part.cmp(&right_part) {
            Ordering::Equal => {}
            order => return order,
        }
    }
    Ordering::Equal
}

pub fn build_mod_alias_map(mods: &[ModRecord]) -> HashMap<String, String> {
    let mut aliases = HashMap::new();
    for mod_item in mods {
        for alias in dependency_aliases_for_record(mod_item) {
            let normalized = normalize_dependency_name(&alias);
            if !normalized.is_empty() {
                aliases.insert(normalized, mod_item.id.clone());
            }
        }
    }
    aliases
}

pub fn collect_transitive_required_dependency_mod_ids(
    base_mod_ids: &[String],
    source_records: &[ModRecord],
    target_mods: &[ModRecord],
    is_source_enabled: impl Fn(&ModRecord) -> bool,
) -> HashSet<String> {
    let seed_mod_ids = dependency_closure_seed_mod_ids(base_mod_ids, target_mods);
    collect_dependency_closure_inferred(
        source_records,
        target_mods,
        &seed_mod_ids,
        is_source_enabled,
    )
}

pub fn collect_required_dependency_closure_mod_ids(
    base_mod_ids: &[String],
    source_records: &[ModRecord],
    target_mods: &[ModRecord],
    is_source_enabled: impl Fn(&ModRecord) -> bool,
) -> Vec<String> {
    let seed_mod_ids = dependency_closure_seed_mod_ids(base_mod_ids, target_mods);
    let inferred = collect_transitive_required_dependency_mod_ids(
        base_mod_ids,
        source_records,
        target_mods,
        is_source_enabled,
    );
    let mut result: Vec<String> = seed_mod_ids.union(&inferred).cloned().collect();
    result.sort();
    result
}

fn dependency_aliases_for_record(record: &ModRecord) -> Vec<String> {
    let mut aliases = vec![record.id.clone()];
    aliases.extend(catalog_aliases_for_record(record));
    aliases
}

fn catalog_aliases_for_record(record: &ModRecord) -> Vec<String> {
    vec![
        record.name.clone(),
        record.metadata.name.clone(),
        record.file_name.clone(),
        strip_zip_extension(&record.file_name).to_string(),
        record.relative_path.clone(),
    ]
}

fn dependency_closure_seed_mod_ids(
    base_mod_ids: &[String],
    target_mods: &[ModRecord],
) -> HashSet<String> {
    base_mod_ids
        .iter()
        .cloned()
        .chain(
            target_mods
                .iter()
                .filter(|mod_item| mod_item.protected)
                .map(|mod_item| mod_item.id.clone()),
        )
        .collect()
}

fn collect_dependency_closure_inferred(
    source_records: &[ModRecord],
    target_mods: &[ModRecord],
    seed_mod_ids: &HashSet<String>,
    is_source_enabled: impl Fn(&ModRecord) -> bool,
) -> HashSet<String> {
    let mod_by_id: HashMap<String, _> = target_mods
        .iter()
        .map(|mod_item| (mod_item.id.clone(), mod_item))
        .collect();
    let alias_to_mod_id = build_mod_alias_map(target_mods);
    let mut enabled = seed_mod_ids.clone();
    let mut inferred = HashSet::new();
    let mut queue: VecDeque<String> = enabled.iter().cloned().collect();

    for record in source_records
        .iter()
        .filter(|record| is_source_enabled(record))
    {
        for dependency in &record.dependencies {
            add_dependency(
                &dependency.name,
                &alias_to_mod_id,
                &mut enabled,
                &mut inferred,
                &mut queue,
            );
        }
    }

    while let Some(mod_id) = queue.pop_front() {
        let Some(mod_item) = mod_by_id.get(&mod_id) else {
            continue;
        };
        for dependency in &mod_item.dependencies {
            add_dependency(
                &dependency.name,
                &alias_to_mod_id,
                &mut enabled,
                &mut inferred,
                &mut queue,
            );
        }
    }

    inferred
}

fn add_dependency(
    name: &str,
    alias_to_mod_id: &HashMap<String, String>,
    enabled: &mut HashSet<String>,
    inferred: &mut HashSet<String>,
    queue: &mut VecDeque<String>,
) {
    if let Some(mod_id) = alias_to_mod_id.get(&normalize_dependency_name(name)) {
        if enabled.insert(mod_id.clone()) {
            inferred.insert(mod_id.clone());
            queue.push_back(mod_id.clone());
        }
    }
}

fn strip_zip_extension(value: &str) -> &str {
    if value.to_ascii_lowercase().ends_with(".zip") {
        &value[..value.len() - 4]
    } else {
        value
    }
}

fn normalize_builtin_dependency_name(name: &str) -> String {
    name.chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{CompletionStatus, Dependency, ModKind, ModMetadata};
    use serde::Deserialize;
    use std::fs;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DependencyRulesContract {
        normalize: Vec<NormalizeCase>,
        builtin: Vec<BuiltinCase>,
        versions: Vec<VersionCase>,
        closure: ClosureCase,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct NormalizeCase {
        input: String,
        expected: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BuiltinCase {
        name: String,
        expected: bool,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VersionCase {
        installed: String,
        required: String,
        too_low: bool,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ClosureCase {
        enabled_map_ids: Vec<String>,
        base_mod_ids: Vec<String>,
        expected_closure: Vec<String>,
        expected_inferred: Vec<String>,
        maps: Vec<ModRecord>,
        other_mods: Vec<ModRecord>,
    }

    #[test]
    fn matches_dependency_rules_contract() {
        let contract = read_contract();

        for item in contract.normalize {
            assert_eq!(normalize_dependency_name(&item.input), item.expected);
        }
        for item in contract.builtin {
            assert_eq!(is_builtin_dependency_name(&item.name), item.expected);
        }
        for item in contract.versions {
            assert_eq!(
                version_too_low(&item.installed, &item.required),
                item.too_low
            );
        }

        let inferred = sorted(
            collect_transitive_required_dependency_mod_ids(
                &contract.closure.base_mod_ids,
                &contract.closure.maps,
                &contract.closure.other_mods,
                |record| record.protected || contract.closure.enabled_map_ids.contains(&record.id),
            )
            .into_iter()
            .collect(),
        );
        let closure = collect_required_dependency_closure_mod_ids(
            &contract.closure.base_mod_ids,
            &contract.closure.maps,
            &contract.closure.other_mods,
            |record| record.protected || contract.closure.enabled_map_ids.contains(&record.id),
        );

        assert_eq!(inferred, contract.closure.expected_inferred);
        assert_eq!(closure, contract.closure.expected_closure);
    }

    #[test]
    fn dependency_closure_keeps_protected_mods_and_transitive_dependencies() {
        let mut protected_mod = record("protected", "Protected.zip", "Protected", &["Shared"]);
        protected_mod.protected = true;
        let maps = vec![record("map", "Adventure.zip", "Adventure", &["Helper One"])];
        let mods = vec![
            record(
                "helper-one",
                "Helper_One.zip",
                "Helper One",
                &["CoreHelper"],
            ),
            record("core-helper", "CoreHelper.zip", "CoreHelper", &[]),
            record("shared", "Shared.zip", "Shared", &[]),
            protected_mod,
        ];

        assert_eq!(
            collect_required_dependency_closure_mod_ids(&[], &maps, &mods, |record| record.id
                == "map"),
            vec![
                "core-helper".to_string(),
                "helper-one".to_string(),
                "protected".to_string(),
                "shared".to_string()
            ]
        );
    }

    fn read_contract() -> DependencyRulesContract {
        let text = fs::read_to_string("../tests/dependency-rules.contract.json")
            .expect("contract fixture");
        serde_json::from_str(&text).expect("contract json")
    }

    fn sorted(mut values: Vec<String>) -> Vec<String> {
        values.sort();
        values
    }

    fn record(id: &str, file_name: &str, name: &str, dependencies: &[&str]) -> ModRecord {
        ModRecord {
            id: id.to_string(),
            name: name.to_string(),
            file_name: file_name.to_string(),
            relative_path: format!("Mods/{file_name}"),
            absolute_path: file_name.to_string(),
            is_archive: true,
            kind: ModKind::Mod,
            enabled: true,
            favorite: false,
            protected: false,
            read_only: false,
            metadata: ModMetadata {
                name: name.to_string(),
                dependencies: dependencies.iter().map(|name| dependency(name)).collect(),
                ..ModMetadata::default()
            },
            map_ids: vec![],
            sub_maps: vec![],
            map_count: 0,
            strawberry_count: 0,
            strawberry_total_count: 0,
            completion_status: CompletionStatus::Unknown,
            dependencies: dependencies.iter().map(|name| dependency(name)).collect(),
            optional_dependencies: vec![],
            stats: None,
            warnings: vec![],
        }
    }

    fn dependency(name: &str) -> Dependency {
        Dependency {
            name: name.to_string(),
            version: String::new(),
        }
    }
}
