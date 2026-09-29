const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { join } = require('node:path');

test('打包后的 Snapshot LSP 可通过 stdio 提供诊断和补全', async (t) => {
  const server = fork(join(__dirname, '../dist/server.cjs'), ['--stdio'], { silent: true });
  t.after(() => server.kill());
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const messages = [];
  const waiters = [];
  let stderr = '';
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
      messages.push(message);
      for (const waiter of [...waiters]) {
        if (waiter.predicate(message)) {
          waiter.resolve(message);
          waiters.splice(waiters.indexOf(waiter), 1);
        }
      }
    }
  });
  const send = (message) => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
    server.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  };
  const waitFor = (predicate) =>
    new Promise((resolve, reject) => {
      const found = messages.find(predicate);
      if (found) return resolve(found);
      let timeout;
      const waiter = {
        predicate,
        resolve: (message) => {
          clearTimeout(timeout);
          resolve(message);
        },
      };
      waiters.push(waiter);
      timeout = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`LSP 响应超时：${stderr}`));
      }, 5000);
      timeout.unref();
    });
  const request = (method, params) => {
    const id = nextId++;
    send({ id, method, params });
    return waitFor((message) => message.id === id);
  };

  const initialized = await request('initialize', { processId: process.pid, rootUri: null, capabilities: {} });
  assert.equal(initialized.result.serverInfo.name, 'snapshot-lsp');
  send({ method: 'initialized', params: {} });
  const uri = 'file:///snapshot-lsp-smoke.snapshot';
  send({
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri,
        languageId: 'snapshot',
        version: 1,
        text: '<Snapshot><Container color="invalid"/></Snapshot>',
      },
    },
  });
  const diagnostic = await waitFor((message) => message.method === 'textDocument/publishDiagnostics');
  assert.ok(diagnostic.params.diagnostics.some((item) => item.code === 'invalid-color'));
  send({
    method: 'textDocument/didChange',
    params: {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: '<Snapshot><Co' }],
    },
  });
  await waitFor((message) => message.method === 'textDocument/publishDiagnostics' && message.params.version === 2);
  const completion = await request('textDocument/completion', {
    textDocument: { uri },
    position: { line: 0, character: 13 },
  });
  assert.ok(completion.result.some((item) => item.label === 'Container'));
  await request('shutdown', null);
  send({ method: 'exit' });
});
