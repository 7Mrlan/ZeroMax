package com.anotherwhy.zero.perf;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.HashMap;
import java.util.Map;

/** Opt-in JS bridge for benchmark-only, PII-free performance events. */
public final class ZeroPerformanceModule extends ReactContextBaseJavaModule {
    public ZeroPerformanceModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "ZeroPerformance";
    }

    @Override
    public Map<String, Object> getConstants() {
        Map<String, Object> constants = new HashMap<>();
        constants.put("enabled", ZeroPerformanceStore.isEnabled());
        return constants;
    }

    @ReactMethod
    public void mark(String name) {
        ZeroPerformanceStore.mark(name);
    }

    @ReactMethod
    public void record(String name, double durationMs) {
        ZeroPerformanceStore.record(name, durationMs);
    }

    @ReactMethod
    public void flush() {
        ZeroPerformanceStore.flush();
    }
}
