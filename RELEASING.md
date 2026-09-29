# 发布 Snapshot DSL VS Code 扩展

## 发布前

1. 更新 `package.json` 中的版本号，并将对应版本的功能写入 `CHANGELOG.md`。
2. 运行 `pnpm install --frozen-lockfile`、`pnpm run format:check`、`pnpm run release:check`、`pnpm test` 和 `pnpm run test:vsix`。
3. 更新生产依赖后，运行 `pnpm run notices:generate`，确认 VSIX 包含 `LICENSE.txt` 和 `THIRD_PARTY_NOTICES.md`。
4. 确认工作区干净，提交改动。推送到 GitHub 后，检查构建工作流通过且可下载 `snapshot-vsix` 产物。

## 发布

在 GitHub Actions 验证通过后，创建与 `package.json` 一致的 `vX.Y.Z` 标签，并将对应 VSIX 附加到 GitHub Release。不要重复使用已发布的版本号。

如需发布到 VS Code Marketplace，先确认 `muedsa` 发布者身份可用，并在本地环境变量 `VSCE_PAT` 中设置发布令牌，然后运行：

```bash
pnpm exec vsce publish --packagePath vscode-snapshot-lsp-X.Y.Z.vsix
```

发布后，从 Marketplace 安装该版本并打开 `sample/example1.snapshot`，检查语言模式、着色、诊断、补全和重启命令。
