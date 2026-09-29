export type HighlightKind =
  'tag' | 'attribute' | 'string' | 'color' | 'number' | 'boolean' | 'enum' | 'comment' | 'cdata' | 'punctuation';

export interface HighlightSpan {
  kind: HighlightKind;
  start: number;
  end: number;
}

export interface HighlightWindow {
  from: number;
  to: number;
}

export type HighlightCatalog = Record<
  string,
  { attributes: Record<string, { kind: string; values?: readonly string[] }> }
>;

const tagName = /[A-Za-z][A-Za-z0-9:_-]*/y;
const attributeName = /[A-Za-z_:][A-Za-z0-9:._-]*/y;
const whitespace = /\s/;
const unquotedValueEnd = /[\s/>]/;

function attributeValueKind(catalog: HighlightCatalog, tag: string, attribute: string): HighlightKind {
  const spec = catalog[tag]?.attributes[attribute];
  if (!spec) return 'string';
  if (spec.kind === 'color') return 'color';
  if (spec.kind === 'number' || spec.kind === 'integer') return 'number';
  if (spec.kind === 'boolean') return 'boolean';
  if (spec.values?.length) return 'enum';
  return 'string';
}

/** 扫描 Snapshot 标记，不依赖 VS Code 的 TextMate 语法或语言服务器。 */
export function scanHighlights(source: string, catalog: HighlightCatalog, window?: HighlightWindow): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  const add = (kind: HighlightKind, start: number, end: number) => {
    const clippedStart = Math.max(start, window?.from ?? 0);
    const clippedEnd = Math.min(end, window?.to ?? source.length);
    if (clippedEnd > clippedStart) spans.push({ kind, start: clippedStart, end: clippedEnd });
  };

  let i = 0;
  while (i < (window?.to ?? source.length)) {
    const lt = source.indexOf('<', i);
    if (lt < 0 || lt >= (window?.to ?? source.length)) break;

    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      i = end < 0 ? source.length : end + 3;
      add('comment', lt, i);
      continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      i = end < 0 ? source.length : end + 3;
      add('cdata', lt, i);
      continue;
    }

    let cursor = lt + 1;
    if (source[cursor] === '/') cursor++;
    tagName.lastIndex = cursor;
    const name = tagName.exec(source);
    if (!name) {
      i = lt + 1;
      continue;
    }

    add('punctuation', lt, cursor);
    add('tag', cursor, cursor + name[0].length);
    cursor += name[0].length;

    while (cursor < source.length) {
      while (whitespace.test(source[cursor] ?? '')) cursor++;
      if (source[cursor] === '>') {
        add('punctuation', cursor, cursor + 1);
        cursor++;
        break;
      }
      if (source[cursor] === '/' && source[cursor + 1] === '>') {
        add('punctuation', cursor, cursor + 2);
        cursor += 2;
        break;
      }

      attributeName.lastIndex = cursor;
      const attr = attributeName.exec(source);
      if (!attr) {
        cursor++;
        continue;
      }
      add('attribute', cursor, cursor + attr[0].length);
      cursor += attr[0].length;
      while (whitespace.test(source[cursor] ?? '')) cursor++;
      if (source[cursor] !== '=') continue;
      add('punctuation', cursor, cursor + 1);
      cursor++;
      while (whitespace.test(source[cursor] ?? '')) cursor++;

      const start = cursor;
      const quote = source[cursor] === '"' || source[cursor] === "'" ? source[cursor] : undefined;
      if (quote) {
        const end = source.indexOf(quote, cursor + 1);
        cursor = end < 0 ? source.length : end + 1;
      } else {
        while (cursor < source.length && !unquotedValueEnd.test(source[cursor])) cursor++;
      }
      add(attributeValueKind(catalog, name[0], attr[0]), start, cursor);
    }
    i = cursor;
  }
  return spans;
}
