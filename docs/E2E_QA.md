# E2E 与无障碍验收

本目录的 Maestro 流程以 Android 包 `com.anotherwhy.zero` 为目标。流程使用页面传入的稳定 `testID`，不依赖图标坐标或列表索引。

## 执行前提

API35 emulator-5554 当前已连接，Maestro CLI 2.11.0 与工作区 debug APK 已准备；五条流程仍未取得通过证据，因此这里仍只记录可执行契约，不能把未运行的流程标记为通过。

```sh
pnpm android
maestro test .maestro/onboarding.yaml
maestro test .maestro/entry-mode.yaml
maestro test .maestro/tab-navigation.yaml
maestro test .maestro/ai-settings.yaml
maestro test .maestro/categories.yaml
```

所有独立流程先清理应用状态并执行 `onboarding.yaml`；真实设备回归时应额外保存 Maestro 输出和设备/系统版本。AI 流程不得填写真实 API key，网络访问保持关闭。

## 流程覆盖

- `onboarding.yaml`：Splash、Welcome、Personalize、分类选择、币种选择，验证新安装可以到达主 Tab。
- `entry-mode.yaml`：首页打开 AddEntry，支出/收入在同一屏幕局部切换，验证两个 tab 的 selected state 语义和输入控件可达。
- `tab-navigation.yaml`：Home、Reports、Categories、Debts 四个 tab 使用稳定 ID，验证切换后页面标题/入口可见。
- `ai-settings.yaml`：通过 Settings 到达 AI 设置，验证隐私提示、HTTPS endpoint、model、密钥输入和开关可访问；不触发真实请求。
- `categories.yaml`：打开分类页、确认新增入口与已有分类可读；包含父分类的 fixture 时再验证展开按钮 `expanded` 状态和子分类缩进。

## 无障碍契约

录入模式和底栏使用 `accessibilityRole=tab` 与 selected state；开关使用 `accessibilityRole=switch`；Onboarding 分类和币种使用 checkbox/radio 状态；动态分类根行在有子项时使用 expanded state。TalkBack/VoiceOver 人工回归仍需在连接设备上完成，Maestro 只负责稳定定位和可见状态断言。

## 未完成项

当前已有 API35 x86_64 模拟器的 fresh v4/JSI 冷启动证据；onboarding flow 已实际尝试但未取得完整通过，其他四条 Maestro flow、TalkBack 和 iOS VoiceOver 尚无通过证据。设备回归后将把命令、设备型号、API/系统版本、构建 commit 和失败截图记录到本文件，之后再把对应路线图任务标记为完成。

2026-10-12 的真实尝试：Maestro 2.11.0 在 API35 emulator-5554 上启动 debug APK，曾到达 Welcome，但 `onboarding-name` 未取得稳定通过；早期失败与 Welcome 清库 writer 阻塞有关，`18bfcf3` 已移除该首帧等待并改用 typed onboarding push。重启 Metro 后仍受首次 bundle/React host 启动时序影响，尚未取得完整 flow 证据，因此仍保持 blocker。

2026-10-12 release E2E 复测：test-signed release（无 Metro）已稳定通过 Splash→Welcome→Personalize、输入姓名、键盘隐藏和 Continue；此前 `.maestro/onboarding.yaml` 缺少 `hideKeyboard`，已补齐。随后 flow 仍在分类入口阶段未取得完整通过，当前继续保持 E2E blocker；debug Metro 首次 bundle 时序也会导致 selector 等待超时。

2026-10-12 latest release E2E：加入 typed nested navigation 后，test-signed release 无 Metro 通过 Splash→Welcome→Personalize→姓名→键盘隐藏→Continue；分类入口仍未出现，当前已增加 onboarding submit error logging，待继续定位 createUser/write 或后续导航状态。
