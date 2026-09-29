import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const windows = process.platform === 'win32';
const result = spawnSync(
  windows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm',
  windows ? ['/d', '/s', '/c', 'pnpm licenses list --prod --json'] : ['licenses', 'list', '--prod', '--json'],
  { encoding: 'utf8' },
);
if (result.status !== 0) throw new Error(`无法读取生产依赖许可证：${result.stderr || result.error}`);

const report = JSON.parse(result.stdout);
const groups = new Map();
for (const [license, packages] of Object.entries(report)) {
  for (const pkg of packages) {
    const directory = pkg.paths[0];
    const files = await readdir(directory, { withFileTypes: true });
    const file = files
      .filter((item) => item.isFile() && /^(license|licence|copying)(?:[.-].*)?$/i.test(item.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))[0];
    if (!file) throw new Error(`${pkg.name}@${pkg.versions[0]} 缺少许可证文件`);
    const content = (await readFile(join(directory, file.name), 'utf8')).replace(/\r\n?/g, '\n').trimEnd();
    const key = `${license}\n${content}`;
    const members = groups.get(key) ?? [];
    members.push(`${pkg.name}@${pkg.versions[0]}`);
    groups.set(key, members);
  }
}

const sections = [...groups.entries()]
  .map(([key, members]) => {
    const [license, ...lines] = key.split('\n');
    members.sort((a, b) => a.localeCompare(b, 'en'));
    return { license, content: lines.join('\n'), members };
  })
  .sort((a, b) => a.members[0].localeCompare(b.members[0], 'en'));
const notice = [
  '# 第三方许可',
  '',
  '以下文本来自扩展打包的生产依赖。依赖版本变化后，运行 `pnpm run notices:generate` 更新本文件。',
  '',
  ...sections.flatMap(({ license, content, members }) => [
    `## ${license}：${members[0]}`,
    '',
    ...members.map((member) => `- ${member}`),
    '',
    '```text',
    content,
    '```',
    '',
  ]),
].join('\n');

if (process.argv.includes('--check')) {
  const current = await readFile('THIRD_PARTY_NOTICES.md', 'utf8').catch(() => '');
  if (current.replace(/\r\n?/g, '\n') !== notice) {
    throw new Error('第三方许可清单与当前生产依赖不一致，请运行 pnpm run notices:generate');
  }
  console.log(`第三方许可清单已同步：${sections.length} 组，${[...groups.values()].flat().length} 个依赖`);
} else if (process.argv.includes('--write')) {
  await writeFile('THIRD_PARTY_NOTICES.md', notice);
  console.log(`已生成第三方许可清单：${sections.length} 组，${[...groups.values()].flat().length} 个依赖`);
} else {
  throw new Error('请使用 --check 或 --write');
}
