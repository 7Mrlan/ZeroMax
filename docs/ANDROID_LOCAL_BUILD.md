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

结果：`BUILD SUCCESSFUL`，424 tasks（85 executed，339 up-to-date），随后
`pnpm run android:artifact:check` 通过。构建期间仍有 AGP legacy variant API
deprecation warning；它没有阻止 debug 构建，但应在 RN/AGP 后续升级中处理。

这份记录只证明干净主机可以生成 debug APK。没有连接设备，因此不证明启动、
迁移、WAL/崩溃恢复、帧率、16 KB page runtime、签名或商店发布。
