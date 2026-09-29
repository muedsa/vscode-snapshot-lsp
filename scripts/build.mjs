import { build, context } from 'esbuild';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const options = [
  {
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['vscode'],
    sourcemap: true,
  },
  {
    entryPoints: [require.resolve('@muedsa/snapshot-lsp/node')],
    outfile: 'dist/server.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: true,
  },
];

if (process.argv.includes('--watch')) {
  const contexts = await Promise.all(options.map((option) => context(option)));
  await Promise.all(contexts.map((item) => item.watch()));
  console.log('正在监听客户端和语言服务器源码');
} else {
  await Promise.all(options.map((option) => build(option)));
}
