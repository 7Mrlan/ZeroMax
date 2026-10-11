# Upstream 记录

## Remotes

| Remote | URL | 用途 |
| --- | --- | --- |
| `zero-upstream` | https://github.com/lossless-protocols-org/zero.git | 官方维护线、定期同步 |
| `zerox-upstream` | https://github.com/wuchengsi/zerox.git | 二次开发功能参考 |

## 当前基线

- Zero `v2.6.6`: `d7725cdfd57d2067224792ac907ff4795444c615`
- Zerox `v1.0.0`: `a21abd63dddb6fda1a2816d8ed735abb7b7f0fa9`
- 共同祖先: `76817d5bb32ebd716bbb37421de5491ea8d5d8e4`
- 当前开发分支 `codex/zero-zerox` 直接基于 Zero `d7725cd`，不是文档仓库的无关历史。

## 同步规则

1. 先在 `zero-upstream` 拉取新 tag，建立独立 `chore/upstream-zero-vX` 分支。
2. 只移植经过审查的提交；不要直接把官方 main 覆盖功能分支。
3. 数据库 schema/migration、导出格式、原生工程和依赖升级必须单独评审。
4. 官方同步提交格式：`chore(upstream): sync zero vX.Y.Z`。
5. 同步后运行完整迁移矩阵、导入导出 round-trip、Android/iOS release smoke，并更新 [改造探索与方案](改造探索与方案.md)。

## 推送保护

当前没有用户个人 fork URL，因此两个 upstream remote 的 `pushurl` 已设置为 `DISABLED`，只能 fetch，避免误推官方仓库。拿到个人 fork URL 后再新增 `origin`，设置 `remote.pushDefault origin`，并保留 upstream 的禁推保护。

## 许可证

两条上游线均为 BSD 2-Clause。发布版本保留 LICENSE/NOTICE、上游链接和改造记录。
