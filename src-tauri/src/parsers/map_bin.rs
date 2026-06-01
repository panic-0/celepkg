pub fn count_strawberries(bytes: &[u8]) -> Option<u64> {
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

pub fn is_strawberry_entity(name: &str) -> bool {
    let normalized = name
        .rsplit(['/', ':'])
        .next()
        .unwrap_or(name)
        .replace(['_', '-'], "")
        .to_lowercase();
    matches!(
        normalized.as_str(),
        "strawberry" | "goldenberry" | "moonberry" | "silverberry"
    )
}

fn count_element_strawberries(reader: &mut BinReader<'_>, lookup: &[String]) -> Result<u64, ()> {
    let name = reader.take_lookup(lookup)?;
    let mut count = u64::from(is_strawberry_entity(name));
    let attr_count = reader.take_u8()?;
    for _ in 0..attr_count {
        let _key = reader.take_lookup(lookup)?;
        reader.skip_attr(lookup)?;
    }
    let child_count = reader.take_u16()?;
    for _ in 0..child_count {
        count = count.saturating_add(count_element_strawberries(reader, lookup)?);
    }
    Ok(count)
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
        assert!(!is_strawberry_entity("memorialTextController"));
    }

    #[test]
    fn counts_strawberry_elements_in_binary_map() {
        let bytes = fake_map_bin(&["strawberry", "goldenBerry", "moonBerry", "spinner"]);

        assert_eq!(count_strawberries(&bytes), Some(3));
    }

    fn fake_map_bin(entity_names: &[&str]) -> Vec<u8> {
        let mut lookup = vec!["Map", "levels", "level", "entities"];
        lookup.extend(entity_names.iter().copied());
        let mut bytes = Vec::new();
        push_string(&mut bytes, "CELESTE MAP");
        push_string(&mut bytes, "pkg");
        bytes.extend_from_slice(&(lookup.len() as i16).to_le_bytes());
        for value in &lookup {
            push_string(&mut bytes, value);
        }

        let entity_children: Vec<Vec<u8>> = (0..entity_names.len())
            .map(|index| element((4 + index) as u16, vec![]))
            .collect();
        let entities = element(3, entity_children);
        let level = element(2, vec![entities]);
        let levels = element(1, vec![level]);
        bytes.extend(element(0, vec![levels]));
        bytes
    }

    fn element(name_index: u16, children: Vec<Vec<u8>>) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&name_index.to_le_bytes());
        bytes.push(0);
        bytes.extend_from_slice(&(children.len() as u16).to_le_bytes());
        for child in children {
            bytes.extend(child);
        }
        bytes
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
