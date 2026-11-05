const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { join } = require('node:path');

function startServer(t) {
  const server = fork(join(__dirname, '../dist/server.cjs'), ['--stdio'], { silent: true });
  t.after(() => server.kill());
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  let stderr = '';
  const responses = new Map();
  const waiters = new Map();
  server.stderr.on('data', (chunk) => (stderr += chunk.toString()));
  server.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) break;
      const length = Number(/Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, headerEnd).toString())?.[1]);
      if (!Number.isFinite(length) || buffer.length < headerEnd + 4 + length) break;
      const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString());
      buffer = buffer.subarray(headerEnd + 4 + length);
      if (message.id === undefined) continue;
      const waiter = waiters.get(message.id);
      if (waiter) {
        waiter(message);
        waiters.delete(message.id);
      } else responses.set(message.id, message);
    }
  });
  const send = (message) => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
    server.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  };
  const request = (method, params) => {
    const id = nextId++;
    send({ id, method, params });
    return new Promise((resolve, reject) => {
      const existing = responses.get(id);
      if (existing) {
        responses.delete(id);
        resolve(existing);
        return;
      }
      const timeout = setTimeout(() => {
        waiters.delete(id);
        reject(new Error(`LSP 响应超时：${stderr}`));
      }, 5000);
      timeout.unref();
      waiters.set(id, (message) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
  };
  return { request, send };
}

function applyEdits(source, edits) {
  const offset = (position) => {
    let start = 0;
    for (let line = 0; line < position.line; line++) start = source.indexOf('\n', start) + 1;
    return start + position.character;
  };
  const ranges = edits
    .map((edit) => ({ start: offset(edit.range.start), end: offset(edit.range.end), text: edit.newText }))
    .sort((a, b) => b.start - a.start);
  for (let index = 1; index < ranges.length; index++) assert.ok(ranges[index].end <= ranges[index - 1].start);
  return ranges.reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
}

for (const snippetSupport of [true, false, undefined]) {
  test(`打包后的 LSP 适配 snippet 能力及跨行补全（${snippetSupport ?? '缺省'}）`, async (t) => {
    const { request, send } = startServer(t);
    const capabilities =
      snippetSupport === undefined ? {} : { textDocument: { completion: { completionItem: { snippetSupport } } } };
    const initialized = await request('initialize', { processId: process.pid, rootUri: null, capabilities });
    assert.equal(initialized.result.serverInfo.version, '0.3.0');
    send({ method: 'initialized', params: {} });
    const uri = 'file:///snapshot-lsp-completion.snapshot';
    const open = '<Snapshot><Container wi';
    send({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, languageId: 'snapshot', version: 1, text: open } },
    });
    const complete = async (text, position) => {
      const result = await request('textDocument/completion', {
        textDocument: { uri },
        position: { line: position.line, character: position.character },
      });
      assert.ok(Array.isArray(result.result), text);
      return result.result;
    };
    const width = (await complete(open, { line: 0, character: open.length })).find((item) => item.label === 'width');
    assert.equal(width.insertTextFormat, snippetSupport === true ? 2 : 1);
    assert.equal(width.textEdit.newText, snippetSupport === true ? 'width="${1}"' : 'width=""');

    const change = (version, text) =>
      send({
        method: 'textDocument/didChange',
        params: { textDocument: { uri, version }, contentChanges: [{ text }] },
      });
    const existing = '<Snapshot><Container width="10"/>';
    change(2, existing);
    const existingWidth = (await complete(existing, { line: 0, character: existing.indexOf('width') + 2 })).find(
      (item) => item.label === 'width',
    );
    assert.equal(existingWidth.textEdit.newText, 'width');
    assert.equal(applyEdits(existing, [existingWidth.textEdit]), existing);

    const closing = '<Snapshot><Container></Con';
    change(3, closing);
    const container = (await complete(closing, { line: 0, character: closing.length })).find(
      (item) => item.label === 'Container',
    );
    assert.equal(container.textEdit.newText, 'Container>');
    assert.equal(applyEdits(closing, [container.textEdit]), '<Snapshot><Container></Container>');

    const multiline = '<Snapshot><Text text="中文😀" textDirection="\r\nR\r\n"/></Snapshot>';
    change(4, multiline);
    const rtl = (await complete(multiline, { line: 1, character: 1 })).find((item) => item.label === 'RTL');
    assert.equal(rtl.textEdit.range.start.line, 1);
    assert.equal(rtl.textEdit.range.end.line, 1);
    assert.ok(rtl.additionalTextEdits?.length);
    assert.equal(
      applyEdits(multiline, [rtl.textEdit, ...rtl.additionalTextEdits]),
      '<Snapshot><Text text="中文😀" textDirection="RTL"/></Snapshot>',
    );

    const boolean = '<Snapshot><Text softW';
    change(5, boolean);
    const softWrap = (await complete(boolean, { line: 0, character: boolean.length })).find(
      (item) => item.label === 'softWrap',
    );
    assert.equal(softWrap.insertTextFormat, snippetSupport === true ? 2 : 1);
    assert.equal(softWrap.textEdit.newText, snippetSupport === true ? 'softWrap="${1:true}"' : 'softWrap="true"');

    const decoration = '<Snapshot><Text decoration="underline li"/></Snapshot>';
    change(6, decoration);
    const lineThrough = (await complete(decoration, { line: 0, character: decoration.indexOf('li"') + 2 })).find(
      (item) => item.label === 'LINE_THROUGH',
    );
    assert.ok(lineThrough);
    assert.equal(
      applyEdits(decoration, [lineThrough.textEdit, ...(lineThrough.additionalTextEdits ?? [])]),
      '<Snapshot><Text decoration="underline LINE_THROUGH"/></Snapshot>',
    );

    const unquoted = '<Snapshot><Container padding=8 width="20"/></Snapshot>';
    change(7, unquoted);
    const padding = (
      await complete(unquoted, { line: 0, character: unquoted.indexOf('padding=') + 'padding='.length })
    ).find((item) => item.label === '8 16');
    assert.ok(padding);
    assert.equal(
      applyEdits(unquoted, [padding.textEdit, ...(padding.additionalTextEdits ?? [])]),
      '<Snapshot><Container padding="8 16" width="20"/></Snapshot>',
    );
    await request('shutdown', null);
    send({ method: 'exit' });
  });
}
