import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const changelog = await readFile('CHANGELOG.md', 'utf8');
const readme = await readFile('README.md', 'utf8');
const version = manifest.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`正式版本号无效：${version}`);
if (!new RegExp(`^## ${version.replace(/\./g, '\\.')} - \\d{4}-\\d{2}-\\d{2}$`, 'm').test(changelog)) {
  throw new Error(`CHANGELOG.md 缺少 ${version} 的发布说明`);
}
if (!readme.includes(`vscode-snapshot-lsp-${version}.vsix`)) {
  throw new Error(`README.md 中的 VSIX 文件名与版本 ${version} 不一致`);
}
if (manifest.publisher !== 'muedsa' || manifest.license !== 'MIT') {
  throw new Error('发布者或许可证与项目发布信息不一致');
}
console.log(`发布元数据已核对：${manifest.publisher}.${manifest.name}@${version}`);
