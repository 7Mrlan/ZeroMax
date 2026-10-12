package com.anotherwhy.zero.perf;

import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.Nullable;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Bounded, opt-in benchmark event storage. Normal builds keep this entirely
 * disabled; benchmark builds flush compact, PII-free JSON records on demand.
 */
public final class ZeroPerformanceStore {
    private static final String TAG = "ZeroPerf";
    private static final int MAX_EVENTS = 4096;
    private static final long PROCESS_START_NANOS = SystemClock.elapsedRealtimeNanos();
    private static final Deque<String> EVENTS = new ArrayDeque<>(MAX_EVENTS);
    private static volatile boolean enabled = false;
    private static int droppedEvents = 0;

    private ZeroPerformanceStore() {}

    public static void configure(boolean benchmarkEnabled) {
        enabled = benchmarkEnabled;
    }

    public static boolean isEnabled() {
        return enabled;
    }

    public static void mark(String name) {
        if (!enabled || !isValidName(name)) return;
        append(eventJson("mark", name, null));
    }

    public static void record(String name, double durationMs) {
        if (!enabled || !isValidName(name) || !Double.isFinite(durationMs) || durationMs < 0 || durationMs > 1_000_000_000d) return;
        append(eventJson("measure", name, durationMs));
    }

    public static synchronized void flush() {
        if (!enabled) return;
        String[] events = EVENTS.toArray(new String[0]);
        int dropped = droppedEvents;
        EVENTS.clear();
        droppedEvents = 0;
        for (String event : events) Log.i(TAG, event);
        if (dropped > 0) Log.i(TAG, "{\"type\":\"overflow\",\"droppedEvents\":" + dropped + "}");
    }

    private static synchronized void append(String event) {
        if (EVENTS.size() == MAX_EVENTS) {
            EVENTS.removeFirst();
            droppedEvents += 1;
        }
        EVENTS.addLast(event);
    }

    private static String eventJson(String type, String name, @Nullable Double durationMs) {
        JSONObject object = new JSONObject();
        try {
            object.put("type", type);
            object.put("name", name);
            object.put("elapsedMs", (SystemClock.elapsedRealtimeNanos() - PROCESS_START_NANOS) / 1_000_000d);
            if (durationMs != null) object.put("durationMs", durationMs);
            return object.toString();
        } catch (JSONException error) {
            return "{\"type\":\"invalid\",\"name\":\"" + name + "\"}";
        }
    }

    private static boolean isValidName(String name) {
        return name != null && name.length() <= 80 && name.matches("[a-zA-Z0-9._-]+");
    }
}
