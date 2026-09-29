const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { buildSync } = require('esbuild');

test('扩展把扫描结果作为编辑器装饰，并使用自身声明的颜色项', async () => {
  const source = '<Snapshot><Text color="#fff" fontSize="18"/></Snapshot>';
  const applied = new Map();
  const editor = {
    document: {
      languageId: 'snapshot',
      version: 1,
      getText: () => source,
      positionAt: (offset) => ({ offset }),
    },
    setDecorations: (decoration, ranges) => applied.set(decoration.color.id, ranges),
  };
  const disposable = { dispose() {} };
  const vscode = {
    ThemeColor: class {
      constructor(id) {
        this.id = id;
      }
    },
    Range: class {
      constructor(start, end) {
        this.start = start;
        this.end = end;
      }
    },
    Disposable: class {
      constructor(dispose) {
        this.dispose = dispose;
      }
    },
    window: {
      visibleTextEditors: [editor],
      createTextEditorDecorationType: ({ color }) => ({ color }),
      onDidChangeVisibleTextEditors: () => disposable,
      onDidChangeTextEditorVisibleRanges: () => disposable,
    },
    workspace: {
      onDidChangeTextDocument: () => disposable,
      onDidOpenTextDocument: () => disposable,
    },
  };
  const built = buildSync({
    entryPoints: [resolve(__dirname, '../src/colorizer.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    write: false,
  });
  const compiledModule = { exports: {} };
  runInNewContext(built.outputFiles[0].text, {
    module: compiledModule,
    exports: compiledModule.exports,
    require: (name) => {
      assert.equal(name, 'vscode');
      return vscode;
    },
    setTimeout,
    clearTimeout,
    WeakMap,
    Map,
  });
  const catalog = (await import('@muedsa/snapshot-lsp')).tags;
  compiledModule.exports.registerSnapshotColorizer({ subscriptions: [] }, catalog);
  const snippets = (id) =>
    Array.from(applied.get(id) ?? [], (range) => source.slice(range.start.offset, range.end.offset));
  assert.deepEqual(snippets('snapshot.tagName'), ['Snapshot', 'Text', 'Snapshot']);
  assert.deepEqual(snippets('snapshot.colorValue'), ['"#fff"']);
  assert.deepEqual(snippets('snapshot.numberValue'), ['"18"']);
  assert.ok(applied.has('snapshot.comment'));
  assert.equal(applied.size, 10);
});
