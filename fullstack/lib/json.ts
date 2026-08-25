export type JsonTokenKind = "key" | "string" | "number" | "boolean" | "null" | "punct";

export interface JsonToken {
  text: string;
  kind: JsonTokenKind;
}

/**
 * Matches one JSON literal at a time: a quoted string (optionally followed by the
 * `:` that makes it a key), a number, or a keyword. Anything the regex skips over
 * is structural punctuation/whitespace and is emitted verbatim.
 */
const TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b/g;

/**
 * Tokenizes a single line of pretty-printed JSON for syntax highlighting.
 *
 * Line-at-a-time is safe here because `JSON.stringify` never emits a raw newline
 * inside a string literal (it escapes them), so no token can straddle two lines  -
 * which means the console can highlight a 10,000-row body one visible line at a
 * time instead of tokenizing the whole megabyte up front.
 */
export function tokenizeJsonLine(line: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let lastIndex = 0;

  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), kind: "punct" });
    }

    const [full, stringLiteral, colonSuffix, numberLiteral, booleanLiteral, nullLiteral] = match;
    if (stringLiteral !== undefined) {
      // `"userId":` is a key; a bare `"user_1"` in the same position is a value.
      tokens.push({ text: stringLiteral, kind: colonSuffix ? "key" : "string" });
      if (colonSuffix) tokens.push({ text: colonSuffix, kind: "punct" });
    } else if (numberLiteral !== undefined) {
      tokens.push({ text: numberLiteral, kind: "number" });
    } else if (booleanLiteral !== undefined) {
      tokens.push({ text: booleanLiteral, kind: "boolean" });
    } else if (nullLiteral !== undefined) {
      tokens.push({ text: nullLiteral, kind: "null" });
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), kind: "punct" });
  }
  return tokens;
}

/** Pretty-prints for display, falling back to the raw text when it isn't valid JSON. */
export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Byte length as the network sees it  -  `String.length` undercounts non-ASCII ids. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
