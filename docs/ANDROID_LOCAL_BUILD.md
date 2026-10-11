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

锁定 fixture：在 app 私有 legacy `watermelon.db` 上用 Android `/system/bin/sqlite3` 保持 `BEGIN EXCLUSIVE`，启动 BootGate 后错误页显示 `database is locked (code 5 SQLITE_BUSY)`，没有打开 writable adapter 或覆盖源库；释放事务后点击 Retry，Zero v3 迁移完成并 marker=`activated`。该证据覆盖 locked source fail-closed/retry，仍不替代权限拒绝和性能矩阵。

权限边界复核：API35 test-signed release 的 manifest 只把 `READ_EXTERNAL_STORAGE`/`WRITE_EXTERNAL_STORAGE` 声明到 `maxSdkVersion=32`；API35 `dumpsys package com.anotherwhy.zero` 的 requested permissions 只有 INTERNET 和应用内部签名权限，因此 API35 上不存在可拒绝的外部存储运行时权限。`requestStoragePermission()` 在 API > 32 直接返回 true，API <= 32 才调用 `PermissionsAndroid.requestMultiple` 并由 Settings/Existing User 在 false 时给出打开设置的路径。真实“拒绝权限”仍需 API32 或更低设备，当前主机只有 API35 AVD，不能把该项标记为通过。

2026-10-12 追加 API32 AVD `zero-api32`（Android 12/API 32、`sdk_gphone64_x86_64`）验证：安装 test-signed release 后，`dumpsys package` 确认两个存储权限已声明且初始为 denied；通过 Settings → Export data 触发 `requestMultiple` 后，系统自动将两项变为 granted，导出提示为成功。随后用 `pm revoke` 和 appops deny 预置再重试，系统仍在请求阶段恢复为 granted，未出现可断言的用户拒绝对话框。该结果证明 API32 AVD 可覆盖权限声明和请求路径，但不能证明拒绝分支；拒绝分支仍需真实用户在系统设置中手动关闭权限或另一台系统镜像，保持发布阻断。

2026-10-12 non-empty WAL 迁移复测（代码基准 `9f45aee`）：先用宿主机 SQLite 生成的 WAL 三件套注入 debug app，原生 backup 正确发现 `-shm` 锁字节在 Android 打开过程中变化并返回 `SOURCE_CHANGED`；该负向结果证明 fail-closed 生效，不能把宿主机 WAL 当作通过。随后改用同一 API35 emulator 内 `/system/bin/sqlite3` 在 app 私有 `watermelon.db` 上执行 `PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0`，插入一条合法 expense（引用真实 `ce/u1`），保持连接后由 `am force-stop` 终止，保留非空 `watermelon.db-wal` 24,752 bytes 和 `watermelon.db-shm` 32,768 bytes。重新启动 debug/Metro 后 BootGate 完成 v3→v4：target `user_version=4`、`integrity_check=ok`，users/categories/currencies/debtors/debts/budgets 各 1 行，expenses 2 行、金额总和 `15.0`，source 同时读取为 2 行/`15.0`，target 主库 204,800 bytes；未出现 migration error/FATAL。该证据覆盖同一 Android SQLite 实现的真实非空 WAL backup/read-back，仍不替代重复 fault、权限拒绝、正式 release 和性能矩阵。
