import { resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

await runTests({
  extensionDevelopmentPath: resolve('.'),
  extensionTestsPath: resolve('test/extension-host/index.cjs'),
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
  launchArgs: [resolve('sample'), '--disable-extensions', '--skip-welcome', '--disable-workspace-trust'],
});
