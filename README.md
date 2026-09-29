# Snapshot DSL VS Code 扩展

基于 [snapshot-lsp](https://github.com/muedsa/snapshot-lsp) 的 VS Code 语言服务客户端。打开 `.snapshot` 文件时，扩展会启动语言服务器，提供诊断、补全和悬停信息。扩展自身负责着色，支持注释、CDATA、标签、属性名及属性值，不依赖其他语言的语法规则。

编辑器还会根据标签自动缩进，支持按缩进折叠标签内容，以及折叠多行注释。

大纲和面包屑显示 Snapshot 标签层级。使用 VS Code 的“格式化文档”可整理标签和跨行属性的缩进；格式化会遵循当前文件的空格或制表符设置，并保留已有属性换行、文本、注释和 CDATA 内容。

## 自定义颜色

扩展为浅色、深色和高对比度主题提供默认颜色。颜色属性、数字、布尔值和枚举值根据 `snapshot-lsp` 的属性目录分别着色。可以在 VS Code 的 `settings.json` 中通过 `workbench.colorCustomizations` 修改，例如：

```json
{
  "workbench.colorCustomizations": {
    "snapshot.tagName": "#4FC1FF",
    "snapshot.attributeName": "#9CDCFE",
    "snapshot.string": "#CE9178",
    "snapshot.colorValue": "#D7BA7D",
    "snapshot.numberValue": "#B5CEA8",
    "snapshot.booleanValue": "#569CD6",
    "snapshot.enumValue": "#C586C0",
    "snapshot.comment": "#6A9955",
    "snapshot.cdata": "#CE9178",
    "snapshot.punctuation": "#808080"
  }
}
```

颜色项由扩展的扫描器应用于 Snapshot 文档；切换主题或修改这些颜色时，无需改动语言服务器。
对于大文件，扩展只为可见区域及附近生成着色范围，滚动时会继续更新。

## 开发

要求 pnpm 12、Node.js 22+，以及支持 Node.js 22 扩展主机的 VS Code。

依赖已记录在 `package.json` 和 `pnpm-lock.yaml`。安装时需将 `@muedsa` 作用域指向 `https://npm.pkg.github.com`，并按 GitHub Packages 的要求配置读取令牌。不要将令牌提交到仓库。然后运行：

```bash
pnpm install --frozen-lockfile
pnpm run build
```

在 VS Code 中按 F5 启动扩展开发主机，然后打开 `.snapshot` 文件进行调试。开发期间运行 `pnpm run watch` 会在源码变化时重新生成客户端和服务端 bundle；修改扩展代码后仍需重新加载扩展开发主机。`pnpm run check` 可单独检查 TypeScript 类型；`pnpm test` 会验证已安装语言服务器的 LSP 协议。

提交改动前运行 `pnpm run format:check` 检查格式；需要自动整理时运行 `pnpm run format`。

`pnpm run test:extension` 会启动独立的 VS Code 扩展开发主机，检查激活、诊断、补全和重启命令。默认下载稳定版 VS Code；若要复用本机安装，设置 `VSCODE_EXECUTABLE_PATH` 为 VS Code 可执行文件的绝对路径。

`pnpm run test:vsix` 会先打包，再从 VSIX 解压扩展并运行相同的扩展主机检查，用于验证最终安装包不依赖工作区中的 `node_modules`。
测试还覆盖标签大纲、格式化、着色扫描及编辑器装饰的颜色项。

语言服务无响应时，可从命令面板运行“Snapshot: 重启语言服务器”。

## 打包和安装

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run test:vsix
code --install-extension vscode-snapshot-lsp-1.0.0.vsix --force
```

`pnpm run package` 会生成可安装的 VSIX，并把客户端和 Snapshot 语言服务器编入包内。安装 VSIX 的机器无需另行安装 npm 依赖。也可以在 VS Code 的扩展视图中选择“从 VSIX 安装”。

VSIX 中包含 [第三方许可](THIRD_PARTY_NOTICES.md)。更新生产依赖后运行 `pnpm run notices:generate`，打包前会自动检查该清单是否与依赖一致。

GitHub Actions 在推送、拉取请求和手动触发时运行测试并打包 VSIX。构建产物可从对应工作流的 `snapshot-vsix` artifact 下载。工作流使用仓库的 `GITHUB_TOKEN` 读取 GitHub Packages 中的 `@muedsa/snapshot-lsp`；若该包尚未授权此仓库访问，需要在包的设置中授予仓库读取权限。

维护者的完整发布步骤见 [RELEASING.md](RELEASING.md)。
