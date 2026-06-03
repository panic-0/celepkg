use crate::domain::{Dependency, ModMetadata};
use serde_yaml::Value;
use std::borrow::Cow;

pub fn parse_metadata(text: &str) -> ModMetadata {
    parse_metadata_checked(text).unwrap_or_default()
}

pub fn parse_metadata_checked(text: &str) -> Result<ModMetadata, serde_yaml::Error> {
    let text = normalize_metadata_text(text);
    if text.trim().is_empty() {
        return Ok(ModMetadata::default());
    }
    let value: Value = serde_yaml::from_str(&text)?;
    let root = value
        .as_sequence()
        .and_then(|seq| seq.first())
        .unwrap_or(&value);
    Ok(ModMetadata {
        name: yaml_string(root, &["Name", "name"]),
        version: yaml_string(root, &["Version", "version"]),
        author: yaml_string(root, &["Author", "author", "Authors", "authors"]),
        description: yaml_string(root, &["Description", "description"]),
        dependencies: yaml_dependencies(root, &["Dependencies", "dependencies"]),
        optional_dependencies: yaml_dependencies(
            root,
            &[
                "OptionalDependencies",
                "optionalDependencies",
                "optional_dependencies",
            ],
        ),
    })
}

fn normalize_metadata_text(text: &str) -> Cow<'_, str> {
    let text = text.trim_start_matches('\u{feff}');
    if text.contains('\r') {
        Cow::Owned(text.replace("\r\n", "\n").replace('\r', "\n"))
    } else {
        Cow::Borrowed(text)
    }
}

pub fn is_builtin_dependency(name: &str) -> bool {
    let normalized = normalize_builtin_dependency_name(name);
    normalized.starts_with("everest")
        || matches!(
            normalized.as_str(),
            "celeste" | "monocle" | "fna" | "dotnet" | "netframework" | "microsoftnetframework"
        )
}

fn yaml_string(root: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(value) = root.get(*key) {
            match value {
                Value::String(text) => return text.clone(),
                Value::Number(number) => return number.to_string(),
                Value::Sequence(seq) => {
                    return seq
                        .iter()
                        .filter_map(|item| item.as_str().map(ToString::to_string))
                        .collect::<Vec<_>>()
                        .join(", ")
                }
                _ => {}
            }
        }
    }
    String::new()
}

fn yaml_dependencies(root: &Value, keys: &[&str]) -> Vec<Dependency> {
    keys.iter()
        .find_map(|key| root.get(*key))
        .and_then(Value::as_sequence)
        .map(|seq| seq.iter().filter_map(normalize_dependency).collect())
        .unwrap_or_default()
}

fn normalize_dependency(value: &Value) -> Option<Dependency> {
    match value {
        Value::String(name) => Some(Dependency {
            name: name.clone(),
            version: String::new(),
        }),
        Value::Mapping(_) => {
            let name = yaml_string(
                value,
                &["Name", "name", "Dependency", "dependency", "Mod", "mod"],
            );
            if name.is_empty() {
                None
            } else {
                Some(Dependency {
                    name,
                    version: yaml_string(
                        value,
                        &["Version", "version", "MinimumVersion", "minimumVersion"],
                    ),
                })
            }
        }
        _ => None,
    }
}

fn normalize_builtin_dependency_name(name: &str) -> String {
    // Built-in dependency names are matched loosely so punctuation variants such as
    // ".NET Framework" and "net-framework" resolve to the same key.
    name.chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn treats_everest_family_as_builtin_dependency() {
        assert!(is_builtin_dependency("EverestCore"));
        assert!(is_builtin_dependency("Everest 1.4980.0"));
        assert!(is_builtin_dependency(".NET Framework"));
    }

    #[test]
    fn parses_metadata_with_bom_and_crlf() {
        let metadata = parse_metadata_checked(
            "\u{feff}- Name: ExtendedCameraDynamics\r\n  Version: 1.2.0\r\n  Dependencies:\r\n    - Name: Everest\r\n      Version: 1.5577.0\r\n",
        )
        .unwrap();

        assert_eq!(metadata.name, "ExtendedCameraDynamics");
        assert_eq!(metadata.version, "1.2.0");
        assert_eq!(metadata.dependencies[0].name, "Everest");
        assert_eq!(metadata.dependencies[0].version, "1.5577.0");
    }
}
