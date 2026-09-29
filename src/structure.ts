export interface SnapshotTag {
  name: string;
  start: number;
  nameStart: number;
  end: number;
  closing: boolean;
  selfClosing: boolean;
}

export interface SnapshotRange {
  start: number;
  end: number;
}

export interface SnapshotStructure {
  tags: SnapshotTag[];
  ignored: SnapshotRange[];
}

const namePattern = /[A-Za-z][A-Za-z0-9:_-]*/y;

/** 跳过注释、CDATA 和引号中的尖括号，提取完整标签。 */
export function scanStructure(source: string): SnapshotStructure {
  const tags: SnapshotTag[] = [];
  const ignored: SnapshotRange[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start) || source.startsWith('<![CDATA[', start)) {
      const comment = source.startsWith('<!--', start);
      const marker = comment ? '-->' : ']]>';
      const close = source.indexOf(marker, start + (comment ? 4 : 9));
      cursor = close < 0 ? source.length : close + marker.length;
      ignored.push({ start, end: cursor });
      continue;
    }

    const closing = source[start + 1] === '/';
    const nameStart = start + (closing ? 2 : 1);
    namePattern.lastIndex = nameStart;
    const name = namePattern.exec(source)?.[0];
    if (!name) {
      cursor = start + 1;
      continue;
    }
    let quote: string | undefined;
    let end = nameStart + name.length;
    while (end < source.length) {
      const character = source[end];
      if (quote) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
      end++;
    }
    if (end === source.length) break;
    const selfClosing = !closing && /\/\s*>$/.test(source.slice(nameStart, end + 1));
    tags.push({ name, start, nameStart, end: end + 1, closing, selfClosing });
    cursor = end + 1;
  }
  return { tags, ignored };
}

export interface SnapshotNode {
  tag: SnapshotTag;
  end: number;
  children: SnapshotNode[];
}

/** 容错构建大纲：不匹配的结束标签不会使后续节点丢失。 */
export function buildTagTree(tags: readonly SnapshotTag[]): SnapshotNode[] {
  const roots: SnapshotNode[] = [];
  const stack: SnapshotNode[] = [];
  for (const tag of tags) {
    if (tag.closing) {
      let match = -1;
      for (let index = stack.length - 1; index >= 0; index--) {
        if (stack[index].tag.name === tag.name) {
          match = index;
          break;
        }
      }
      if (match < 0) continue;
      for (let index = stack.length - 1; index >= match; index--) stack[index].end = tag.end;
      stack.length = match;
      continue;
    }
    const node: SnapshotNode = { tag, end: tag.end, children: [] };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    if (!tag.selfClosing) stack.push(node);
  }
  const lastEnd = tags.at(-1)?.end ?? 0;
  for (const node of stack) node.end = Math.max(node.end, lastEnd);
  return roots;
}

export interface IndentEdit {
  start: number;
  end: number;
  text: string;
}

/** 仅整理标签及其跨行属性的前导缩进，保留文本、注释、CDATA 和原有换行。 */
export function formatIndentation(source: string, indentUnit: string): IndentEdit[] {
  const { tags, ignored } = scanStructure(source);
  const edits: IndentEdit[] = [];
  let depth = 0;
  let tagIndex = 0;
  let ignoredIndex = 0;
  let lineStart = 0;
  while (lineStart < source.length) {
    const lineEnd = source.indexOf('\n', lineStart);
    const end = lineEnd < 0 ? source.length : lineEnd;
    const line = source.slice(lineStart, end);
    const leading = /^[ \t]*/.exec(line)?.[0] ?? '';
    const contentStart = lineStart + leading.length;

    while (tagIndex < tags.length && tags[tagIndex].end <= lineStart) {
      const tag = tags[tagIndex++];
      if (tag.closing) depth = Math.max(0, depth - 1);
      else if (!tag.selfClosing) depth++;
    }
    while (ignoredIndex < ignored.length && ignored[ignoredIndex].end <= contentStart) ignoredIndex++;
    const insideIgnored = ignoredIndex < ignored.length && ignored[ignoredIndex].start <= contentStart;
    const current = tags[tagIndex];
    const startsTag = current?.start === contentStart;
    const insideTag = current && current.start < contentStart && contentStart < current.end;
    if (!insideIgnored && contentStart < end && (startsTag || insideTag)) {
      const level = startsTag ? Math.max(0, depth - (current.closing ? 1 : 0)) : depth + 1;
      const desired = indentUnit.repeat(level);
      if (leading !== desired) edits.push({ start: lineStart, end: contentStart, text: desired });
    }
    if (lineEnd < 0) break;
    lineStart = lineEnd + 1;
  }
  return edits;
}
