const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { buildSync } = require('esbuild');

const built = buildSync({
  entryPoints: [resolve(__dirname, '../src/structure.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const compiledModule = { exports: {} };
runInNewContext(built.outputFiles[0].text, { module: compiledModule, exports: compiledModule.exports });
const { scanStructure, buildTagTree, formatIndentation } = compiledModule.exports;

function formatted(source, unit = '  ') {
  let result = source;
  for (const edit of Array.from(formatIndentation(source, unit)).reverse()) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

test('大纲跳过注释、CDATA 和引号内的伪标签，并包含嵌套标签', () => {
  const source =
    '<Snapshot note="<Fake>"><!-- <Fake/> --><Container><Text><![CDATA[<Fake/>]]></Text></Container></Snapshot>';
  const tree = buildTagTree(scanStructure(source).tags);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].tag.name, 'Snapshot');
  assert.equal(tree[0].end, source.length);
  assert.equal(tree[0].children[0].tag.name, 'Container');
  assert.equal(tree[0].children[0].children[0].tag.name, 'Text');
});

test('不匹配的结束标签不会阻断后续大纲', () => {
  const tree = buildTagTree(scanStructure('<Snapshot><Text/></Wrong><Container/></Snapshot>').tags);
  assert.deepEqual(
    Array.from(tree[0].children, (node) => node.tag.name),
    ['Text', 'Container'],
  );
});

test('未闭合标签在输入过程中仍显示于大纲', () => {
  for (const source of ['<Snapshot', '<Snapshot><Container', '<Snapshot><Container note="<Fake']) {
    const tree = buildTagTree(scanStructure(source).tags);
    assert.equal(tree[0]?.tag.name, 'Snapshot');
    assert.equal(tree[0].end, source.length);
    assert.deepEqual(
      Array.from(tree[0].children, (node) => node.tag.name),
      source === '<Snapshot' ? [] : ['Container'],
    );
  }
  const closing = '<Snapshot><Text/></Snapshot';
  assert.equal(buildTagTree(scanStructure(closing).tags)[0].end, closing.length);
  assert.deepEqual(
    Array.from(scanStructure('<Snapshot><!-- <Fake').tags, (tag) => tag.name),
    ['Snapshot'],
  );
});

test('格式化只调整标记缩进，保留跨行属性、文本和注释', () => {
  const source =
    '<Snapshot>\n<Container\ncolor="red">\n  <Text>hello</Text>\n  原样文本\n<!--\n  原样注释\n-->\n</Container>\n</Snapshot>\n';
  const expected =
    '<Snapshot>\n  <Container\n    color="red">\n    <Text>hello</Text>\n  原样文本\n<!--\n  原样注释\n-->\n  </Container>\n</Snapshot>\n';
  assert.equal(formatted(source), expected);
  assert.equal(formatted(expected), expected);
});

test('格式化支持制表符并保留 CRLF', () => {
  const source = '<Snapshot>\r\n<Text/>\r\n</Snapshot>\r\n';
  assert.equal(formatted(source, '\t'), '<Snapshot>\r\n\t<Text/>\r\n</Snapshot>\r\n');
});

test('格式化保留双引号和单引号跨行属性值中的缩进', () => {
  const source = '<Snapshot>\n<Text value="hello\nworld"\nfontFamily=\'first\n   second\nlast\'/>\n</Snapshot>\n';
  const expected =
    '<Snapshot>\n  <Text value="hello\nworld"\n    fontFamily=\'first\n   second\nlast\'/>\n</Snapshot>\n';
  assert.equal(formatted(source), expected);
  assert.equal(formatted(expected), expected);
});
