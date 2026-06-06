export type SearchField = {
  key: string;
  text: string;
  weight: number;
};

export type HighlightRange = {
  start: number;
  end: number;
};

export type SearchMatch = {
  matched: boolean;
  score: number;
  tokens: string[];
  rangesByField: Map<string, HighlightRange[]>;
};

export type SearchMatcher = {
  query: string;
  tokens: string[];
  active: boolean;
};

type NormalizedText = {
  text: string;
  indexMap: number[];
};

export function createSearchMatcher(query: string): SearchMatcher {
  const normalized = normalizeSearchText(query).text;
  const tokens = [...new Set(normalized.split(" ").filter(Boolean))];
  return {
    active: tokens.length > 0,
    query,
    tokens
  };
}

export function matchSearchFields(fields: SearchField[], matcher: SearchMatcher): SearchMatch {
  if (!matcher.active) {
    return { matched: true, score: 0, tokens: [], rangesByField: new Map() };
  }

  const preparedFields = fields
    .map((field) => ({ ...field, normalized: normalizeSearchText(field.text) }))
    .filter((field) => field.normalized.text.length > 0 && field.weight > 0);
  const rangesByField = new Map<string, HighlightRange[]>();
  let score = 0;

  for (const token of matcher.tokens) {
    const tokenMatch = bestTokenMatch(preparedFields, token);
    if (!tokenMatch) {
      return { matched: false, score: 0, tokens: matcher.tokens, rangesByField: new Map() };
    }
    score += tokenMatch.score;
    addHighlightRange(rangesByField, tokenMatch.field.key, tokenMatch.range);
  }

  return {
    matched: true,
    score,
    tokens: matcher.tokens,
    rangesByField: sortRangesByField(rangesByField)
  };
}

export function highlightTextParts(text: string, ranges: HighlightRange[] | undefined) {
  const normalizedRanges = normalizeHighlightRanges(ranges ?? [], text.length);
  if (!normalizedRanges.length) return [{ highlighted: false, text }];

  const parts: Array<{ highlighted: boolean; text: string }> = [];
  let cursor = 0;
  for (const range of normalizedRanges) {
    if (range.start > cursor) parts.push({ highlighted: false, text: text.slice(cursor, range.start) });
    parts.push({ highlighted: true, text: text.slice(range.start, range.end) });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ highlighted: false, text: text.slice(cursor) });
  return parts.filter((part) => part.text.length > 0);
}

export function rangesForField(match: SearchMatch | undefined, fieldKey: string) {
  return match?.rangesByField.get(fieldKey) ?? [];
}

export function normalizeSearchText(value: string): NormalizedText {
  const source = value.replace(/\\/g, "/").replace(/\.zip$/i, "");
  const chars: string[] = [];
  const indexMap: number[] = [];
  let pendingSpaceIndex: number | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (/[\s/_-]/.test(char)) {
      pendingSpaceIndex = pendingSpaceIndex ?? index;
      continue;
    }
    if (pendingSpaceIndex !== null && chars.length > 0) {
      chars.push(" ");
      indexMap.push(pendingSpaceIndex);
    }
    pendingSpaceIndex = null;
    chars.push(char.toLowerCase());
    indexMap.push(index);
  }

  return {
    indexMap,
    text: chars.join("")
  };
}

function bestTokenMatch(fields: Array<SearchField & { normalized: NormalizedText }>, token: string) {
  let best: {
    field: SearchField;
    range: HighlightRange;
    score: number;
  } | null = null;

  for (const field of fields) {
    const index = field.normalized.text.indexOf(token);
    const compactToken = token.replace(/\s+/g, "");
    const compact = compactNormalizedText(field.normalized);
    const compactIndex = index < 0 && compactToken ? compact.text.indexOf(compactToken) : -1;
    if (index < 0 && compactIndex < 0) continue;
    const score =
      index >= 0
        ? scoreTokenMatch(field.normalized.text, token, index, field.weight)
        : scoreTokenMatch(compact.text, compactToken, compactIndex, field.weight) - field.weight * 5;
    if (!best || score > best.score) {
      best = {
        field,
        range:
          index >= 0
            ? normalizedRangeToSourceRange(field.normalized, index, index + token.length)
            : normalizedRangeToSourceRange(compact, compactIndex, compactIndex + compactToken.length),
        score
      };
    }
  }

  return best;
}

function scoreTokenMatch(text: string, token: string, index: number, weight: number) {
  if (text === token) return weight * 100;
  if (index === 0) return weight * 75;
  if (text[index - 1] === " ") return weight * 60;
  return weight * 45;
}

function normalizedRangeToSourceRange(normalized: NormalizedText, start: number, end: number): HighlightRange {
  const sourceStart = normalized.indexMap[start] ?? 0;
  const sourceEnd = (normalized.indexMap[end - 1] ?? sourceStart) + 1;
  return { start: sourceStart, end: sourceEnd };
}

function compactNormalizedText(normalized: NormalizedText): NormalizedText {
  const chars: string[] = [];
  const indexMap: number[] = [];
  for (let index = 0; index < normalized.text.length; index += 1) {
    if (normalized.text[index] === " ") continue;
    chars.push(normalized.text[index]);
    indexMap.push(normalized.indexMap[index]);
  }
  return {
    indexMap,
    text: chars.join("")
  };
}

function addHighlightRange(rangesByField: Map<string, HighlightRange[]>, fieldKey: string, range: HighlightRange) {
  const ranges = rangesByField.get(fieldKey) ?? [];
  ranges.push(range);
  rangesByField.set(fieldKey, ranges);
}

function sortRangesByField(rangesByField: Map<string, HighlightRange[]>) {
  return new Map([...rangesByField].map(([fieldKey, ranges]) => [fieldKey, normalizeHighlightRanges(ranges)]));
}

function normalizeHighlightRanges(ranges: HighlightRange[], textLength = Number.POSITIVE_INFINITY) {
  const sorted = ranges
    .map((range) => ({
      end: Math.min(textLength, Math.max(0, range.end)),
      start: Math.min(textLength, Math.max(0, range.start))
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: HighlightRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
      continue;
    }
    previous.end = Math.max(previous.end, range.end);
  }
  return merged;
}
