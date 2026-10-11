# Zero × Zerox 改造协作规则

在修改代码前先阅读：

- [改造探索与方案](docs/改造探索与方案.md)

该文档是当前产品和技术方案的事实来源。任何新的发现、取舍、版本变更或迁移风险都要先更新文档，再改实现。

## 固定基线

- 维护基线：Zero `v2.6.6` / `d7725cd`。
- 功能来源：Zerox `v1.0.0` / `a21abd6`。
- 共同祖先：`76817d5`。
- 第一阶段保留 `expenses` 与 `incomes` 两张表，通过 repository 提供统一 TransactionRecord；不直接重写为新 transactions 表。
- WatermelonDB schema 从两边冲突的 v3 统一到 v4；导入导出统一到 v5；历史 migration/upgrader 不修改。
- 录入支出/收入使用单路由局部 mode，禁止用 `replace()` 互换两个完整表单页面。
- 用户已明确要求最终栈直接使用最新稳定版：RN 0.87.1、React 19.3.0、TypeScript 7.0.2、Reanimated 4.7.1/Worklets 0.13.0、Navigation 7.5/7.20、Redux Toolkit 2.13.0、FlashList 2.3.3、WatermelonDB 0.28.0、MMKV 4.3.2、Zod 4.6.5；不得把 React 19.2.3 当作目标或兼容实现。React 19.2.3 仅能作为历史对照构建。

## 工作方式

- 保留 `zero-upstream` 与 `zerox-upstream` 两个远端；每次官方同步单独提交 `chore(upstream): sync zero vX`。
- 最终只使用一个包管理器（方案已定 pnpm）；Phase 0 可暂时保留 Zero v2.6.6 的 Bun lock，Phase 1 完成切换后只提交 `pnpm-lock.yaml`。
- 依赖、原生工程、数据库、业务功能、动画和 CI 分开提交，使用 Conventional Commits/Commitizen。
- 数据迁移必须覆盖新安装、Zero v3→v4、Zerox v3→v4，并验证行数、金额总和、关系和备份恢复。
- 任何云端 AI 能力都必须显式开启、脱敏并说明网络权限；不得把 API Key 写入 Redux、数据库、日志或导出文件。
- 不以“删库重建”作为升级方案；迁移失败要阻止进入主界面并提供可恢复路径。

## 提交前检查

至少运行与改动相关的 typecheck、lint、unit/migration tests；原生依赖或导航/动画改动还要跑 Android/iOS release smoke。提交说明应记录测试命令、数据库/导出格式影响和回滚方法。
