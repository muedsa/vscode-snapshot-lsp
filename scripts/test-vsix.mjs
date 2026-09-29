import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import JSZip from 'jszip';
import { runTests } from '@vscode/test-electron';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const vsix = await JSZip.loadAsync(await readFile(`vscode-snapshot-lsp-${version}.vsix`));
const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), 'snapshot-vsix-')));
if (!temporaryRoot.startsWith(resolve(tmpdir()) + sep)) throw new Error('临时目录越界');
const extensionRoot = join(temporaryRoot, 'extension');

try {
  for (const [name, entry] of Object.entries(vsix.files)) {
    if (!name.startsWith('extension/') || entry.dir) continue;
    const target = resolve(extensionRoot, name.slice('extension/'.length));
    if (!target.startsWith(extensionRoot + sep)) throw new Error(`VSIX 文件路径越界：${name}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await entry.async('nodebuffer'));
  }
  await readFile(join(extensionRoot, 'package.json'));

  await runTests({
    extensionDevelopmentPath: extensionRoot,
    extensionTestsPath: resolve('test/extension-host/index.cjs'),
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
    launchArgs: [resolve('sample'), '--disable-extensions', '--skip-welcome', '--disable-workspace-trust'],
  });
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
