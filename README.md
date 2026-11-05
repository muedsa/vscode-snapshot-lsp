# Snapshot DSL VS Code 扩展

基于 [snapshot-lsp](https://github.com/muedsa/snapshot-lsp) 的 VS Code 语言服务客户端。打开 `.snapshot` 文件时，扩展会启动语言服务器，提供诊断、补全和悬停信息。扩展自身负责着色，支持注释、CDATA、标签、属性名及属性值，不依赖其他语言的语法规则。

编辑器还会根据标签自动缩进，支持按缩进折叠标签内容，以及折叠多行注释。

大纲和面包屑显示 Snapshot 标签层级。使用 VS Code 的“格式化文档”可整理标签和跨行属性的缩进；格式化会遵循当前文件的空格或制表符设置，并保留已有属性换行、文本、注释和 CDATA 内容。

## SVG 路径裁剪

扩展内置的 `@muedsa/snapshot-lsp@0.3.0` 支持 `<ClipPath>`：可补全 `path`、`viewBox`、`fit`、`fillRule` 和 `clipBehavior`，提示缺少 `path` 或无效的 `viewBox`，并在大纲与语法着色中识别该标签。`path` 使用 SVG 路径数据；完整路径命令和坐标的有效性由 Snapshot Parser 在实际解析时检查。

```xml
<Snapshot type="png">
  <ClipPath path="M0 0 H240 V240 H0 Z M80 80 H160 V160 H80 Z"
            viewBox="0 0 240 240" fit="CONTAIN" fillRule="EVEN_ODD">
    <Container width="240" height="240" color="#38BDF8" />
  </ClipPath>
</Snapshot>
```

完整示例见 [sample/clip-path.snapshot](sample/clip-path.snapshot)。

## 属性简写与兼容性

内置的 LSP 0.3.0 对齐 Snapshot Parser 2026-11-05 的属性语法，可为以下写法提供补全、悬停说明和静态诊断。综合示例见 [sample/attribute-syntax.snapshot](sample/attribute-syntax.snapshot)。实际渲染这些新写法时，渲染端也必须使用包含该语法变更的 Snapshot Parser；升级编辑器扩展不会升级渲染端。

| 属性             | 新写法示例                                                                               | 说明                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 边距、坐标、圆角 | `padding="8 16"`、`alignment="-1 0"`、`borderRadius="12 / 6"`                            | 边距按 CSS 的上、右、下、左顺序展开。旧 `(1,2,3,4)` 则按左、上、右、下解释，等价新 `2 3 4 1`。    |
| 枚举与字体       | `mainAxisAlignment="space-between"`、`fontFamily="Arial, Noto Sans"`                     | 内置枚举接受大小写及连字符别名；字体名保留原大小写和内部空白，空项报错。                          |
| 变换与边框       | `transform="translate(12,8) rotate(30deg)"`、`border="2 red"`                            | 旋转必须带 `deg` 或 `rad`；变换函数按书写顺序右乘，作用到点时右侧先发生。边框省略样式时默认实线。 |
| 列表与阴影       | `gradientStops="0 .5 1"`、`decoration="underline line-through"`、`boxShadow="0 2 red 4"` | 装饰和色标可用空白分隔；阴影中的 `4` 是模糊半径。                                                 |
| 布尔值           | `<Text softWrap>`、`softWrap="false"`                                                    | 裸属性为 `true`，未提供属性时保留默认值；显式空串、`yes`、`1` 等会报错。                          |

`Snapshot.type` 仍只接受 png/jpg/webp；`ClipPath.fit` 仍只接受 FILL/CONTAIN，`fillRule` 仍只接受 NON_ZERO/EVEN_ODD。URL、正文、字体名和普通 OpenType 标签不会按枚举别名转换。

## 补全行为

VS Code 会向语言服务器声明代码片段能力，因此补全新属性时会把光标放到属性值中；布尔属性默认填入 `true`。覆盖已有属性名时会保留原有赋值。闭合标签补全会补齐缺少的 `>`。多行属性值补全会同时应用主编辑和额外编辑，替换整个值。装饰列表补全只替换当前项，复合值补全会为需要空白的无引号赋值补上引号。

无引号的 URL 或路径值后需要用空格分隔自闭合标记，例如 `<Image url=https://example.com/a.png />`。

## 自定义颜色

扩展为浅色、深色和高对比度主题提供默认颜色。颜色属性、数字、布尔值和枚举值根据 `snapshot-lsp` 的属性目录分别着色；复合属性只有在整个值是单个枚举关键字时使用枚举颜色。可以在 VS Code 的 `settings.json` 中通过 `workbench.colorCustomizations` 修改，例如：

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
code --install-extension vscode-snapshot-lsp-1.1.1.vsix --force
```

`pnpm run package` 会生成可安装的 VSIX，并把客户端和 Snapshot 语言服务器编入包内。安装 VSIX 的机器无需另行安装 npm 依赖。也可以在 VS Code 的扩展视图中选择“从 VSIX 安装”。

VSIX 中包含 [第三方许可](THIRD_PARTY_NOTICES.md)。更新生产依赖后运行 `pnpm run notices:generate`，打包前会自动检查该清单是否与依赖一致。

GitHub Actions 在推送、拉取请求和手动触发时运行测试并打包 VSIX。构建产物可从对应工作流的 `snapshot-vsix` artifact 下载。工作流使用仓库的 `GITHUB_TOKEN` 读取 GitHub Packages 中的 `@muedsa/snapshot-lsp`；若该包尚未授权此仓库访问，需要在包的设置中授予仓库读取权限。

维护者的完整发布步骤见 [RELEASING.md](RELEASING.md)。
