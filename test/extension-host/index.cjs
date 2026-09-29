const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const vscode = require('vscode');

async function waitFor(check, description) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待 ${description} 超时`);
}

async function run() {
  const extension = vscode.extensions.getExtension('muedsa.vscode-snapshot-lsp');
  assert.ok(extension, '扩展应被开发主机加载');

  const sample = await vscode.workspace.openTextDocument(
    vscode.Uri.file(resolve(extension.extensionPath, 'sample/example1.snapshot')),
  );
  assert.equal(sample.languageId, 'snapshot', '.snapshot 文件应自动识别为 Snapshot 语言');
  await vscode.window.showTextDocument(sample);
  await extension.activate();
  const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', sample.uri);
  assert.equal(symbols?.[0]?.name, 'Snapshot', '大纲应显示根标签');
  assert.ok(
    symbols?.[0]?.children.some((item) => item.name === 'Container'),
    '大纲应显示嵌套标签',
  );
  const incompleteOutline = await vscode.workspace.openTextDocument({
    language: 'snapshot',
    content: '<Snapshot><Container',
  });
  const incompleteSymbols = await vscode.commands.executeCommand(
    'vscode.executeDocumentSymbolProvider',
    incompleteOutline.uri,
  );
  assert.equal(incompleteSymbols?.[0]?.children[0]?.name, 'Container', '未闭合标签应显示在大纲中');

  const unformatted = await vscode.workspace.openTextDocument({
    language: 'snapshot',
    content: '<Snapshot>\n<Text color="red">内容</Text>\n</Snapshot>',
  });
  const formatting = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', unformatted.uri, {
    insertSpaces: true,
    tabSize: 2,
  });
  assert.ok(
    formatting?.some((edit) => edit.newText === '  '),
    '格式化应调整嵌套标签缩进',
  );

  const invalid = await vscode.workspace.openTextDocument({
    language: 'snapshot',
    content: '<Snapshot><Container color="not-a-color"/></Snapshot>',
  });
  await vscode.window.showTextDocument(invalid);
  await extension.activate();
  assert.ok(extension.isActive, '打开 Snapshot 文档应激活扩展');
  await waitFor(
    () => vscode.languages.getDiagnostics(invalid.uri).some((item) => item.code === 'invalid-color'),
    '颜色诊断',
  );

  const incomplete = await vscode.workspace.openTextDocument({
    language: 'snapshot',
    content: '<Snapshot><Co',
  });
  await vscode.window.showTextDocument(incomplete);
  const completion = () =>
    vscode.commands.executeCommand('vscode.executeCompletionItemProvider', incomplete.uri, new vscode.Position(0, 13));
  await waitFor(async () => (await completion())?.items.some((item) => item.label === 'Container'), '标签补全');

  await vscode.commands.executeCommand('snapshot.restartLanguageServer');
  await waitFor(async () => (await completion())?.items.some((item) => item.label === 'Container'), '重启后的补全');
}

module.exports = { run };
