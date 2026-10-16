const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { buildSync } = require('esbuild');

const built = buildSync({
  entryPoints: [resolve(__dirname, '../src/highlight.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const compiledModule = { exports: {} };
runInNewContext(built.outputFiles[0].text, { module: compiledModule, exports: compiledModule.exports });
const { scanHighlights } = compiledModule.exports;
let catalog;
test.before(async () => {
  catalog = (await import('@muedsa/snapshot-lsp')).tags;
});

function parts(source, kind) {
  return Array.from(scanHighlights(source, catalog))
    .filter((span) => span.kind === kind)
    .map((span) => source.slice(span.start, span.end));
}

test('扫描标签、属性、属性值、注释和 CDATA，忽略其中的伪标签', () => {
  const source =
    '<Snapshot type="png" debug="true"><!-- <Fake x="bad"> --><Text color="#fff" fontSize="18" fontStyle="BOLD">a <![CDATA[<b>]]></Text></Snapshot>';
  assert.deepEqual(parts(source, 'tag'), ['Snapshot', 'Text', 'Text', 'Snapshot']);
  assert.deepEqual(parts(source, 'attribute'), ['type', 'debug', 'color', 'fontSize', 'fontStyle']);
  assert.deepEqual(parts(source, 'enum'), ['"png"', '"BOLD"']);
  assert.deepEqual(parts(source, 'boolean'), ['"true"']);
  assert.deepEqual(parts(source, 'color'), ['"#fff"']);
  assert.deepEqual(parts(source, 'number'), ['"18"']);
  assert.deepEqual(parts(source, 'string'), []);
  assert.deepEqual(parts(source, 'comment'), ['<!-- <Fake x="bad"> -->']);
  assert.deepEqual(parts(source, 'cdata'), ['<![CDATA[<b>]]>']);
});

test('跨行属性值中的尖括号不会结束标签', () => {
  const source = '<Container note="a > <Fake>"\n color="#fff" />';
  assert.deepEqual(parts(source, 'tag'), ['Container']);
  assert.deepEqual(parts(source, 'attribute'), ['note', 'color']);
  assert.deepEqual(parts(source, 'string'), ['"a > <Fake>"']);
  assert.deepEqual(parts(source, 'color'), ['"#fff"']);
  assert.ok(parts(source, 'punctuation').includes('/>'));
});

test('ClipPath 的 SVG 路径保持字符串着色，枚举属性按目录着色', () => {
  const source =
    '<ClipPath path="M0 0 H10 V10 Z" viewBox="0 0 10 10" fit="CONTAIN" fillRule="EVEN_ODD" clipBehavior="ANTI_ALIAS"><Container/></ClipPath>';
  assert.deepEqual(parts(source, 'tag'), ['ClipPath', 'Container', 'ClipPath']);
  assert.deepEqual(parts(source, 'attribute'), ['path', 'viewBox', 'fit', 'fillRule', 'clipBehavior']);
  assert.deepEqual(parts(source, 'string'), ['"M0 0 H10 V10 Z"', '"0 0 10 10"']);
  assert.deepEqual(parts(source, 'enum'), ['"CONTAIN"', '"EVEN_ODD"', '"ANTI_ALIAS"']);
});

test('大文件窗口着色保留前文词法状态，只返回窗口内范围', () => {
  const source = '<!-- <Fake/> -->\n<Snapshot><Text color="#fff">内容</Text></Snapshot>\n<Container/>';
  const from = source.indexOf('<Text');
  const to = source.indexOf('</Snapshot>');
  const spans = Array.from(scanHighlights(source, catalog, { from, to }));
  assert.deepEqual(
    spans.filter((span) => span.kind === 'tag').map((span) => source.slice(span.start, span.end)),
    ['Text', 'Text'],
  );
  assert.ok(spans.every((span) => span.start >= from && span.end <= to));
  assert.ok(!spans.some((span) => source.slice(span.start, span.end).includes('Fake')));
});
