# SBOM 与第三方许可证

仓库提交规范化的 [THIRD_PARTY_LICENSES.json](./THIRD_PARTY_LICENSES.json)。
它由当前锁定的 pnpm 安装树生成，去掉了本机绝对路径，只保留包名、版本、
许可证和作者字段。

重新安装依赖后运行：

```bash
pnpm install --frozen-lockfile
pnpm run licenses:generate
```

生成器的输入命令写在 JSON 的 `sourceCommand` 字段；依赖、许可证或版本变
更必须在同一个提交中更新清单，并在 PR 描述中说明原生/商店影响。BSD 2-Clause
的 Zero/Zerox 源码许可证继续保留在根目录和两个对照目录中。
