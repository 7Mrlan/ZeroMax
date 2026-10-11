# Android 本机编译记录

2026-10-12 在 Linux x86_64 主机使用临时工具链完成一次干净 Android debug
编译：

- JDK `17.0.20.1`（Temurin）
- Android platform `37.0`
- Build Tools `37.0.0`
- NDK `28.0.12916984`
- Gradle wrapper `9.4.1`

命令：

```bash
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
cd android
./gradlew :app:assembleDebug --no-daemon --stacktrace
```

`pnpm install` runs `scripts/patch-watermelon-jsi-cmake.js`. WatermelonDB 0.28's
legacy JSI CMake file assumes npm hoisting; the postinstall patch keeps the
dependency source unchanged while pointing its native include paths at the
pnpm root graph.

结果：在注册 WatermelonDB JSI 模块并清理 native CMake 缓存后，
`BUILD SUCCESSFUL`，453 tasks 全部执行，随后 `pnpm run android:artifact:check`
和 `pnpm run android:jsi:contract:check` 通过。构建期间仍有 AGP legacy variant
API 和部分第三方库的 deprecation warning；它们没有阻止 debug 构建，但应在
RN/AGP 或上游库升级中处理。

同一主机启动 API 35 x86_64 `zero-api35` 模拟器，安装该 debug APK 后清空应用数据，
通过 Metro 连接冷启动。logcat 同时出现 `Successfully installed Watermelon DB JSI
Bindings!`、`Opened database at .../watermelon_v4.db`、`schema version 4` 和
`Schema set up successfully`，没有出现 `JSI SQLiteAdapter not available` 或
`FATAL`。这证明当前 Android debug 包的 JSI 加载和 fresh v4 BootGate 路径已在
该模拟器上运行；它仍不证明真实设备帧率、WAL 崩溃恢复、签名或商店发布。

这份记录证明干净主机可以生成 debug APK，并证明该 API 35 模拟器上的 JSI
fresh-install 启动路径。它仍不证明真实设备迁移、WAL/崩溃恢复、帧率、16 KB
page runtime、签名或商店发布。

2026-10-12 fresh ownership fault injection：在 API35 `zero-api35` debug app 启动后捕获 `watermelon_v4.db.artifact.json` 的 `status=writing` 窗口，立即 `am force-stop`；重新启动后 marker 为 `activated`。同时拉取 `watermelon_v4.db`、`-wal`、`-shm` 合并检查，得到 `user_version=4`、`PRAGMA integrity_check=ok`，8 张业务表和 `local_storage` 均为 0 行。该证据覆盖 fresh claim/init 窗口，尚不等价于 legacy Zero/Zerox copy 中途 kill、WAL 恢复或性能矩阵。

同一 API35 debug runtime 还执行了真实 legacy fixtures：Zero v3 与 Zerox v3 均完成 native copy/read-back，首次 verified 后点击 Retry 复用 target 并推进 activated。Zero 保持 1 user、1 category、1 expense、1 budget 及金额 expense 12.5/debt 30/budget 100；Zerox 保持 1 user、2 categories、1 expense、1 income、1 debt 及金额 expense 12.5/income 3000/debt 30。target 分别补齐空 incomes/budgets；合并 WAL/SHM 后两库 `user_version=4`、`integrity_check=ok`。这仍不替代 legacy copy 中途 kill、WAL 锁定 fixture 和性能矩阵。

5000 条 Zero v3 fixture 的 legacy copy fault injection 也已完成：在 target marker=`writing` 时 force-stop，第一次重启清理半成品并进入可重试错误页；点击 Retry 后创建新 generation 并激活 target。最终 target v4 合并 WAL/SHM 检查为 `user_version=4`、`integrity_check=ok`、expenses 5,000 行、金额总和 `240084`、budget 金额 `1000`，与 source v3 一致，source 文件仍保留。这是 legacy copy 中途 kill 的真实证据；WAL 锁定/权限 fixture 和性能矩阵仍待完成。
