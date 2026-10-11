# E2E 与无障碍验收

本目录的 Maestro 流程以 Android 包 `com.anotherwhy.zero` 为目标。流程使用页面传入的稳定 `testID`，不依赖图标坐标或列表索引。

## 执行前提

需要一台已连接的 Android API 35/36 设备或模拟器、已安装 Maestro CLI，以及工作区中构建的 debug APK。工作区当前没有连接设备，因此这里记录的是可执行契约，不能把未运行的流程标记为通过。

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

当前没有 Android 设备运行证据，也没有 iOS VoiceOver 证据。设备回归后将把命令、设备型号、API/系统版本、构建 commit 和失败截图记录到本文件，之后再把对应路线图任务标记为完成。
