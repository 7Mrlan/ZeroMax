# E2E 与无障碍验收

本目录的 Maestro 流程以 Android 包 `com.anotherwhy.zero` 为目标。流程使用页面传入的稳定 `testID`，不依赖图标坐标或列表索引。

## 执行前提

2026-10-12 运行时，API35 `zero-api35` emulator-5554 已连接；设备属性为 Android 15/API 35、`sdk_gphone64_x86_64`、`x86_64`，Maestro CLI 2.11.0 使用工作区 test-signed release APK。五条流程均已取得一次完整通过证据；这不是物理设备、TalkBack、网络或性能验收。

```sh
pnpm android
maestro test .maestro/onboarding.yaml
maestro test .maestro/entry-mode.yaml
maestro test .maestro/tab-navigation.yaml
maestro test .maestro/ai-settings.yaml
maestro test .maestro/categories.yaml
```

所有独立流程先清理应用状态并包含自己的 onboarding 前置步骤；真实设备回归时应额外保存 Maestro 输出和设备/系统版本。AI 流程不得填写真实 API key，网络访问保持关闭。

本次通过所用包为 `android/app/build/outputs/apk/release/app-release.apk`，SHA-256 `ed278d82fa75e795f55a859db966b6fb5f90abbda207e81f8639180bb51762b0`；二进制构建时的代码基准为 `8f736b9`，流程夹具修正随后收口在 `58d36b4`。该包使用一次性本地 test keystore 签名，不能作为商店发布签名证据。

## 流程覆盖

- `onboarding.yaml`：Splash、Welcome、Personalize、分类选择、币种选择，验证新安装可以到达主 Tab。
- `entry-mode.yaml`：首页打开 AddEntry，支出/收入在同一屏幕局部切换，验证两个模式的标题和输入控件可达；selected state 仍需 TalkBack/无障碍回归确认。
- `tab-navigation.yaml`：Home、Reports、Categories、Debts 四个 tab 使用稳定 ID，验证切换后页面标题/入口可见。
- `ai-settings.yaml`：通过 Settings 到达 AI 设置，验证隐私提示、endpoint/model/密钥输入和开关控件可见；不触发真实请求，HTTPS/allowlist 和 secure key 语义仍需专项验证。
- `categories.yaml`：打开分类页，确认新增入口和页面标题可见；默认分类行、父分类展开和子分类缩进仍需专项 fixture。

## API35 release 运行记录

| 日期       | 包/设备                                                   | 流程                  | 结果                                                                               |
| ---------- | --------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| 2026-10-12 | test-signed release / API35 `zero-api35` / Maestro 2.11.0 | `onboarding.yaml`     | 通过：Splash → Welcome → Personalize → 分类 → 搜索并选择 USD → Home                |
| 2026-10-12 | 同上                                                      | `categories.yaml`     | 通过：Home → Categories，新增入口和标题可见                                        |
| 2026-10-12 | 同上                                                      | `entry-mode.yaml`     | 通过：AddEntry 内支出/收入切换，两个表单标题与收入金额输入可见                     |
| 2026-10-12 | 同上                                                      | `tab-navigation.yaml` | 通过：Reports → Categories → Debts → Home，标题可见                                |
| 2026-10-12 | 同上                                                      | `ai-settings.yaml`    | 通过：Settings → AI，开关、endpoint、model、密钥输入和隐私提示可见；未触发网络请求 |

Maestro 原始运行目录保留在本机：`070712/onboarding`、`070842/categories`、
`070938/entry-mode`、`071039/tab-navigation`、`071145/ai-settings`；补上 Home
最终断言后，`071959/tab-navigation` 再次通过。完整路径为
`/home/lights/.maestro/tests/2026-10-12_<目录>`，每个目录包含命令元数据和
设备 logcat；这些目录不纳入 Git，需在环境清理前另行归档。

流程中的姓名使用 `Eve User`，因为 `E2E User` 含数字而被产品 `nameSchema` 正确拒绝；USD 通过搜索框输入后选择，因为货币列表不是首屏静态可见项。这两处是测试夹具修正，不是放宽产品校验；负向 disabled boundary 仍未纳入本轮 release flow。

## 无障碍契约

录入模式和底栏使用 `accessibilityRole=tab` 与 selected state；开关使用 `accessibilityRole=switch`；Onboarding 分类和币种使用 checkbox/radio 状态；动态分类根行在有子项时使用 expanded state。TalkBack/VoiceOver 人工回归仍需在连接设备上完成，Maestro 只负责稳定定位和可见状态断言。

## 未完成项

当前已有 API35 x86_64 模拟器的 fresh v4/JSI 冷启动证据和五条 release Maestro flow 通过证据；TalkBack/VoiceOver、长列表、AI 队列恢复、导入恢复、WAL/进程杀死矩阵和 iOS 设备验证仍无通过证据。后续物理设备回归将把命令、设备型号、API/系统版本、构建 commit 和失败截图继续记录到本文件，并只更新对应剩余任务的状态。

2026-10-12 历史尝试：Maestro 2.11.0 在 API35 emulator-5554 上启动 debug APK，曾到达 Welcome，但 `onboarding-name` 未取得稳定通过；早期失败与 Welcome 清库 writer 阻塞有关，`18bfcf3` 已移除该首帧等待并改用 typed onboarding push。重启 Metro 后仍受首次 bundle/React host 启动时序影响；该记录已被上面的 release flow 通过证据取代。

2026-10-12 历史尝试：debug Metro 首次 bundle 时序和旧的 onboarding 夹具曾导致 selector 等待超时；这些记录保留用于解释排障过程，不覆盖上面的 release 通过记录。
