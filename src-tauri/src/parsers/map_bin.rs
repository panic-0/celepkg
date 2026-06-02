#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct StrawberryCounts {
    pub visible: u64,
    pub total: u64,
}

impl StrawberryCounts {
    fn saturating_add(self, other: Self) -> Self {
        Self {
            visible: self.visible.saturating_add(other.visible),
            total: self.total.saturating_add(other.total),
        }
    }
}

#[cfg(test)]
pub fn count_strawberries(bytes: &[u8]) -> Option<u64> {
    count_strawberry_counts(bytes).map(|counts| counts.total)
}

#[cfg(test)]
pub fn count_visible_strawberries(bytes: &[u8]) -> Option<u64> {
    count_strawberry_counts(bytes).map(|counts| counts.visible)
}

pub fn count_strawberry_counts(bytes: &[u8]) -> Option<StrawberryCounts> {
    let mut reader = BinReader::new(bytes);
    let header = reader.take_string().ok()?;
    if header != "CELESTE MAP" {
        return None;
    }
    let _package = reader.take_string().ok()?;
    let lookup_count = reader.take_i16().ok()?;
    if lookup_count < 0 {
        return None;
    }
    let mut lookup = Vec::with_capacity(lookup_count as usize);
    for _ in 0..lookup_count {
        lookup.push(reader.take_string().ok()?);
    }
    count_element_strawberries(&mut reader, &lookup).ok()
}

#[cfg(test)]
pub fn is_strawberry_entity(name: &str) -> bool {
    is_strawberry_entity_name(&normalized_entity_name(name))
}

fn count_element_strawberries(
    reader: &mut BinReader<'_>,
    lookup: &[String],
) -> Result<StrawberryCounts, ()> {
    let name = reader.take_lookup(lookup)?;
    let mut moon = false;
    let attr_count = reader.take_u8()?;
    for _ in 0..attr_count {
        let key = reader.take_lookup(lookup)?;
        if key.eq_ignore_ascii_case("moon") {
            moon = reader.take_boolish_attr(lookup)?;
        } else {
            reader.skip_attr(lookup)?;
        }
    }
    let mut count = strawberry_counts_for_entity(name, moon);
    let child_count = reader.take_u16()?;
    for _ in 0..child_count {
        count = count.saturating_add(count_element_strawberries(reader, lookup)?);
    }
    Ok(count)
}

fn strawberry_counts_for_entity(name: &str, moon: bool) -> StrawberryCounts {
    let normalized = normalized_entity_name(name);
    let total = is_strawberry_entity_name(&normalized);
    let visible = match normalized.as_str() {
        "strawberry" => !moon,
        "returnberry"
        | "strawberrywithreturn"
        | "multiroomstrawberry"
        | "nonpoppingstrawberry"
        | "explodingstrawberry"
        | "cassettefriendlystrawberry"
        | "diagonalwingedstrawberry"
        | "glassberry"
        | "customizableberry" => true,
        _ => false,
    };
    StrawberryCounts {
        visible: u64::from(total && visible),
        total: u64::from(total),
    }
}

fn normalized_entity_name(name: &str) -> String {
    name.rsplit(['/', ':'])
        .next()
        .unwrap_or(name)
        .replace(['_', '-'], "")
        .to_lowercase()
}

fn is_strawberry_entity_name(normalized: &str) -> bool {
    matches!(
        normalized,
        "strawberry"
            | "goldenberry"
            | "moonberry"
            | "silverberry"
            | "memorialtextcontroller"
            | "returnberry"
            | "strawberrywithreturn"
            | "rainbowberry"
            | "multiroomstrawberry"
            | "explodingstrawberry"
            | "nonpoppingstrawberry"
            | "cassettefriendlystrawberry"
            | "diagonalwingedstrawberry"
            | "glassberry"
            | "customizableberry"
            | "secretberry"
            | "goldenstrawberrycustomconditions"
    )
}

struct BinReader<'a> {
    rest: &'a [u8],
}

impl<'a> BinReader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { rest: bytes }
    }

    fn take_u8(&mut self) -> Result<u8, ()> {
        let Some((&value, rest)) = self.rest.split_first() else {
            return Err(());
        };
        self.rest = rest;
        Ok(value)
    }

    fn take_u16(&mut self) -> Result<u16, ()> {
        let bytes = self.take_exact(2)?;
        Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
    }

    fn take_i16(&mut self) -> Result<i16, ()> {
        let bytes = self.take_exact(2)?;
        Ok(i16::from_le_bytes([bytes[0], bytes[1]]))
    }

    fn take_u32(&mut self) -> Result<u32, ()> {
        let bytes = self.take_exact(4)?;
        Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn take_exact(&mut self, len: usize) -> Result<&'a [u8], ()> {
        if self.rest.len() < len {
            return Err(());
        }
        let (head, tail) = self.rest.split_at(len);
        self.rest = tail;
        Ok(head)
    }

    fn take_varint(&mut self) -> Result<usize, ()> {
        let mut result = 0usize;
        let mut shift = 0usize;
        for _ in 0..5 {
            let byte = self.take_u8()?;
            result |= usize::from(byte & 0x7f) << shift;
            if byte & 0x80 == 0 {
                return Ok(result);
            }
            shift += 7;
        }
        Err(())
    }

    fn take_string(&mut self) -> Result<String, ()> {
        let len = self.take_varint()?;
        let bytes = self.take_exact(len)?;
        String::from_utf8(bytes.to_vec()).map_err(|_| ())
    }

    fn take_lookup<'b>(&mut self, lookup: &'b [String]) -> Result<&'b str, ()> {
        let index = usize::from(self.take_u16()?);
        lookup.get(index).map(String::as_str).ok_or(())
    }

    fn skip_attr(&mut self, lookup: &[String]) -> Result<(), ()> {
        match self.take_u8()? {
            0 | 1 => {
                let _ = self.take_u8()?;
            }
            2 => {
                let _ = self.take_u16()?;
            }
            3 | 4 => {
                let _ = self.take_u32()?;
            }
            5 => {
                let _ = self.take_lookup(lookup)?;
            }
            6 => {
                let _ = self.take_string()?;
            }
            7 => {
                let len = self.take_i16()?;
                if len < 0 {
                    return Err(());
                }
                let _ = self.take_exact(len as usize)?;
            }
            _ => return Err(()),
        }
        Ok(())
    }

    fn take_boolish_attr(&mut self, lookup: &[String]) -> Result<bool, ()> {
        match self.take_u8()? {
            0 | 1 => Ok(self.take_u8()? != 0),
            2 => Ok(self.take_u16()? != 0),
            3 | 4 => Ok(self.take_u32()? != 0),
            5 => Ok(!self.take_lookup(lookup)?.is_empty()),
            6 => Ok(!self.take_string()?.is_empty()),
            7 => {
                let len = self.take_i16()?;
                if len < 0 {
                    return Err(());
                }
                let bytes = self.take_exact(len as usize)?;
                Ok(!bytes.is_empty())
            }
            _ => Err(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_vanilla_and_namespaced_berries() {
        assert!(is_strawberry_entity("strawberry"));
        assert!(is_strawberry_entity("goldenBerry"));
        assert!(is_strawberry_entity("moonBerry"));
        assert!(is_strawberry_entity("CollabUtils2/SilverBerry"));
        assert!(is_strawberry_entity("memorialTextController"));
        assert!(is_strawberry_entity("SorbetHelper/ReturnBerry"));
        assert!(is_strawberry_entity("LunaticHelper/StrawberryWithReturn"));
        assert!(is_strawberry_entity("CollabUtils2/RainbowBerry"));
        assert!(is_strawberry_entity("MaxHelpingHand/MultiRoomStrawberry"));
        assert!(is_strawberry_entity("SJ2021/ExplodingStrawberry"));
        assert!(is_strawberry_entity("MaxHelpingHand/NonPoppingStrawberry"));
    }

    #[test]
    fn separates_visible_and_total_strawberries() {
        let bytes = fake_map_bin(&[
            fake_entity("strawberry", &[("winged", true)]),
            fake_entity("strawberry", &[("moon", true)]),
            fake_entity("goldenBerry", &[]),
            fake_entity("memorialTextController", &[]),
            fake_entity("CollabUtils2/SilverBerry", &[]),
            fake_entity("CollabUtils2/RainbowBerry", &[]),
            fake_entity("SorbetHelper/ReturnBerry", &[]),
            fake_entity("LunaticHelper/StrawberryWithReturn", &[]),
            fake_entity("MaxHelpingHand/MultiRoomStrawberry", &[]),
            fake_entity("SJ2021/ExplodingStrawberry", &[]),
            fake_entity("MaxHelpingHand/NonPoppingStrawberry", &[]),
            fake_entity("spinner", &[]),
        ]);

        let counts = count_strawberry_counts(&bytes).expect("map counts");
        assert_eq!(counts.visible, 6);
        assert_eq!(counts.total, 11);
        assert_eq!(count_visible_strawberries(&bytes), Some(6));
        assert_eq!(count_strawberries(&bytes), Some(11));
    }

    #[test]
    fn vanilla_totals_match_chapter_overview_rules() {
        let mut entities = vec![];
        entities.extend((0..165).map(|_| fake_entity("strawberry", &[])));
        entities.extend((0..10).map(|_| fake_entity("strawberry", &[("winged", true)])));
        entities.push(fake_entity("strawberry", &[("moon", true)]));
        entities.extend((0..25).map(|_| fake_entity("goldenBerry", &[])));
        entities.push(fake_entity("memorialTextController", &[]));

        let counts = count_strawberry_counts(&fake_map_bin(&entities)).expect("map counts");

        assert_eq!(counts.visible, 175);
        assert_eq!(counts.total, 202);
    }

    fn fake_entity(name: &'static str, attrs: &'static [(&'static str, bool)]) -> FakeEntity {
        FakeEntity { name, attrs }
    }

    struct FakeEntity {
        name: &'static str,
        attrs: &'static [(&'static str, bool)],
    }

    fn fake_map_bin(entities: &[FakeEntity]) -> Vec<u8> {
        let mut lookup = vec!["Map", "levels", "level", "entities"];
        for entity in entities {
            push_lookup(&mut lookup, entity.name);
            for (key, _) in entity.attrs {
                push_lookup(&mut lookup, key);
            }
        }
        let mut bytes = Vec::new();
        push_string(&mut bytes, "CELESTE MAP");
        push_string(&mut bytes, "pkg");
        bytes.extend_from_slice(&(lookup.len() as i16).to_le_bytes());
        for value in &lookup {
            push_string(&mut bytes, value);
        }

        let entity_children: Vec<Vec<u8>> = entities
            .iter()
            .map(|entity| {
                element(
                    lookup_index(&lookup, entity.name),
                    entity.attrs,
                    vec![],
                    &lookup,
                )
            })
            .collect();
        let entities = element(3, &[], entity_children, &lookup);
        let level = element(2, &[], vec![entities], &lookup);
        let levels = element(1, &[], vec![level], &lookup);
        bytes.extend(element(0, &[], vec![levels], &lookup));
        bytes
    }

    fn element(
        name_index: u16,
        attrs: &[(&str, bool)],
        children: Vec<Vec<u8>>,
        lookup: &[&str],
    ) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&name_index.to_le_bytes());
        bytes.push(attrs.len() as u8);
        for (key, value) in attrs {
            bytes.extend_from_slice(&lookup_index(lookup, key).to_le_bytes());
            bytes.push(0);
            bytes.push(u8::from(*value));
        }
        bytes.extend_from_slice(&(children.len() as u16).to_le_bytes());
        for child in children {
            bytes.extend(child);
        }
        bytes
    }

    fn lookup_index(lookup: &[&str], value: &str) -> u16 {
        lookup
            .iter()
            .position(|item| *item == value)
            .expect("lookup value") as u16
    }

    fn push_lookup<'a>(lookup: &mut Vec<&'a str>, value: &'a str) {
        if !lookup.contains(&value) {
            lookup.push(value);
        }
    }

    fn push_string(bytes: &mut Vec<u8>, value: &str) {
        push_varint(bytes, value.len());
        bytes.extend_from_slice(value.as_bytes());
    }

    fn push_varint(bytes: &mut Vec<u8>, mut value: usize) {
        loop {
            let mut byte = (value & 0x7f) as u8;
            value >>= 7;
            if value != 0 {
                byte |= 0x80;
            }
            bytes.push(byte);
            if value == 0 {
                break;
            }
        }
    }
}
