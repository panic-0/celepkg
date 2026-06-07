use crate::dependency_rules::{compare_numeric_versions, parse_numeric_version, version_too_low};
use crate::domain::{CompletionStatus, Dependency, ModKind, ModMetadata, ModRecord};
use crate::parsers::everest::{is_builtin_dependency, parse_metadata};
use crate::utils::normalize_dependency_name;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub(super) struct DependencyCandidate {
    version: String,
}

#[derive(Debug)]
pub(super) struct DependencyIndex {
    mods: HashMap<String, DependencyCandidate>,
    builtin_versions: HashMap<String, String>,
}

impl DependencyIndex {
    pub(super) fn new(records: &[ModRecord], builtin_versions: HashMap<String, String>) -> Self {
        let mut mods = HashMap::new();
        for record in records {
            let candidate = DependencyCandidate {
                version: record.metadata.version.clone(),
            };
            for alias in dependency_aliases(record) {
                let normalized = normalize_dependency_name(&alias);
                if !normalized.is_empty() {
                    mods.entry(normalized).or_insert_with(|| candidate.clone());
                }
            }
        }
        Self {
            mods,
            builtin_versions,
        }
    }

    fn find_mod(&self, name: &str) -> Option<&DependencyCandidate> {
        self.mods.get(&normalize_dependency_name(name))
    }

    fn builtin_version(&self, name: &str) -> Option<&str> {
        self.builtin_versions
            .get(&normalize_dependency_name(name))
            .map(String::as_str)
    }
}

pub(super) fn dependency_aliases(record: &ModRecord) -> Vec<String> {
    vec![
        record.id.clone(),
        record.name.clone(),
        record.metadata.name.clone(),
        record.file_name.clone(),
        record.file_name.trim_end_matches(".zip").to_string(),
        record.relative_path.clone(),
    ]
}

pub(super) fn dependency_warnings(
    dependencies: &[Dependency],
    dependency_index: &DependencyIndex,
    warn_missing_dependencies: bool,
    unknown_builtin_dependencies: &mut HashSet<String>,
) -> Vec<String> {
    let mut warnings = vec![];
    for dependency in dependencies {
        if dependency.name.trim().is_empty() {
            continue;
        }
        if is_builtin_dependency(&dependency.name) {
            match builtin_dependency_version_warning(dependency, dependency_index) {
                BuiltinDependencyVersionWarning::None => {}
                BuiltinDependencyVersionWarning::TooLow(warning) => warnings.push(warning),
                BuiltinDependencyVersionWarning::Unknown(label) => {
                    unknown_builtin_dependencies.insert(label);
                }
            }
            continue;
        }
        let Some(installed) = dependency_index.find_mod(&dependency.name) else {
            if warn_missing_dependencies {
                warnings.push(format!("缺少依赖：{}", dependency_label(dependency)));
            }
            continue;
        };
        if dependency_version_too_low(&installed.version, &dependency.version) {
            warnings.push(format!(
                "依赖版本可能过低：{} 需要 {}，本地 {}",
                dependency.name, dependency.version, installed.version
            ));
        }
    }
    warnings
}

pub(super) enum BuiltinDependencyVersionWarning {
    None,
    TooLow(String),
    Unknown(String),
}

pub(super) fn builtin_dependency_version_warning(
    dependency: &Dependency,
    dependency_index: &DependencyIndex,
) -> BuiltinDependencyVersionWarning {
    let Some(required_version) = parse_numeric_version(&dependency.version) else {
        return BuiltinDependencyVersionWarning::None;
    };
    let Some(installed_version) = dependency_index.builtin_version(&dependency.name) else {
        return BuiltinDependencyVersionWarning::Unknown(dependency_label(dependency));
    };
    let Some(installed_numeric_version) = parse_numeric_version(installed_version) else {
        return BuiltinDependencyVersionWarning::None;
    };
    if compare_numeric_versions(&installed_numeric_version, &required_version)
        == std::cmp::Ordering::Less
    {
        BuiltinDependencyVersionWarning::TooLow(format!(
            "依赖版本可能过低：{} 需要 {}，本地 {}",
            dependency.name, dependency.version, installed_version
        ))
    } else {
        BuiltinDependencyVersionWarning::None
    }
}

pub(super) fn dependency_version_too_low(installed_version: &str, required_version: &str) -> bool {
    version_too_low(installed_version, required_version)
}

pub(super) fn dependency_label(dependency: &Dependency) -> String {
    if dependency.version.is_empty() {
        dependency.name.clone()
    } else {
        format!("{} {}", dependency.name, dependency.version)
    }
}

pub(super) fn builtin_dependency_versions(celeste_path: &Path) -> HashMap<String, String> {
    let mut versions = HashMap::new();
    insert_builtin_dependency_version(&mut versions, "Celeste", "1.4.0.0");
    if let Some(version) = read_everest_build_version(celeste_path) {
        insert_builtin_dependency_version(&mut versions, "Everest", &version);
        insert_builtin_dependency_version(&mut versions, "EverestCore", &version);
        return versions;
    }
    if let Some(metadata) = read_everest_builtin_metadata(celeste_path) {
        insert_builtin_dependency_version(&mut versions, "Everest", &metadata.version);
        insert_builtin_dependency_version(&mut versions, "EverestCore", &metadata.version);
        insert_builtin_dependency_version(&mut versions, &metadata.name, &metadata.version);
    }
    versions
}

pub(super) fn builtin_mod_records(
    celeste_path: &Path,
    versions: &HashMap<String, String>,
) -> Vec<ModRecord> {
    let everest_version = versions
        .get(&normalize_dependency_name("Everest"))
        .cloned()
        .unwrap_or_default();
    let everest_core_version = versions
        .get(&normalize_dependency_name("EverestCore"))
        .cloned()
        .unwrap_or_else(|| everest_version.clone());
    vec![
        builtin_mod_record(
            "builtin-everest",
            "Everest",
            &everest_version,
            "Celeste/Everest",
            "Celeste 的 Mod 加载器，安装在游戏根目录。",
            celeste_path,
        ),
        builtin_mod_record(
            "builtin-everest-core",
            "EverestCore",
            &everest_core_version,
            "Celeste/EverestCore",
            "Everest 内置核心依赖，由 Everest 安装器维护。",
            celeste_path,
        ),
    ]
}

pub(super) fn builtin_mod_record(
    id: &str,
    name: &str,
    version: &str,
    relative_path: &str,
    description: &str,
    celeste_path: &Path,
) -> ModRecord {
    ModRecord {
        id: id.to_string(),
        name: name.to_string(),
        file_name: name.to_string(),
        relative_path: relative_path.to_string(),
        absolute_path: celeste_path.to_string_lossy().to_string(),
        is_archive: false,
        kind: ModKind::Mod,
        enabled: true,
        favorite: false,
        protected: true,
        read_only: true,
        metadata: ModMetadata {
            name: name.to_string(),
            version: version.to_string(),
            author: "Everest".to_string(),
            description: description.to_string(),
            dependencies: vec![],
            optional_dependencies: vec![],
        },
        map_ids: vec![],
        sub_maps: vec![],
        map_count: 0,
        strawberry_count: 0,
        strawberry_total_count: 0,
        completion_status: CompletionStatus::NotApplicable,
        dependencies: vec![],
        optional_dependencies: vec![],
        stats: None,
        warnings: vec![],
    }
}

pub(super) fn insert_builtin_dependency_version(
    versions: &mut HashMap<String, String>,
    name: &str,
    version: &str,
) {
    let normalized = normalize_dependency_name(name);
    if !normalized.is_empty() && !version.trim().is_empty() {
        versions.insert(normalized, version.to_string());
    }
}

pub(super) fn read_everest_build_version(celeste_path: &Path) -> Option<String> {
    let build = [
        celeste_path.join("Celeste.exe"),
        celeste_path.join("Celeste.dll"),
    ]
    .into_iter()
    .find_map(read_everest_build_from_file)?;
    Some(format!("1.{build}.0"))
}

pub(super) fn read_everest_build_from_file(path: PathBuf) -> Option<u64> {
    const CHUNK_SIZE: usize = 64 * 1024;
    let file = File::open(path).ok()?;
    read_everest_build_from_reader(BufReader::new(file), CHUNK_SIZE)
}

pub(super) fn read_everest_build_from_reader(
    mut reader: impl Read,
    chunk_size: usize,
) -> Option<u64> {
    const MAGIC: &[u8] = b"EverestBuild";
    let mut buffer = vec![0; chunk_size.max(1)];
    let mut matched = 0;
    let mut found_magic = false;
    let mut version_bytes = Vec::new();

    loop {
        let read_len = reader.read(&mut buffer).ok()?;
        if read_len == 0 {
            break;
        }

        for byte in &buffer[..read_len] {
            if found_magic {
                if byte.is_ascii_digit() {
                    version_bytes.push(*byte);
                    continue;
                }
                return (!version_bytes.is_empty())
                    .then(|| std::str::from_utf8(&version_bytes).ok()?.parse().ok())
                    .flatten();
            }

            if *byte == MAGIC[matched] {
                matched += 1;
                if matched == MAGIC.len() {
                    found_magic = true;
                }
            } else {
                matched = usize::from(*byte == MAGIC[0]);
            }
        }
    }

    found_magic
        .then(|| std::str::from_utf8(&version_bytes).ok()?.parse().ok())
        .flatten()
}

pub(super) fn read_everest_builtin_metadata(celeste_path: &Path) -> Option<ModMetadata> {
    [
        celeste_path.join("everest.yaml"),
        celeste_path.join("everest.yml"),
        celeste_path
            .join("Mods")
            .join("Everest")
            .join("everest.yaml"),
        celeste_path
            .join("Mods")
            .join("Everest")
            .join("everest.yml"),
    ]
    .into_iter()
    .find_map(|path| {
        let text = fs::read_to_string(path).ok()?;
        let metadata = parse_metadata(&text);
        (!metadata.version.trim().is_empty()).then_some(metadata)
    })
}
