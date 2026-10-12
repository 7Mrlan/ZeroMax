import {useCallback, useEffect, useRef} from 'react';
import {useFrameCallback, useSharedValue, type FrameInfo} from 'react-native-reanimated';
import {flushPerformanceTrace, isPerformanceTraceEnabled, recordPerformance} from '../utils/performanceTrace';

/**
 * Collects bounded frame-session facts only for the opt-in Android benchmark.
 * The UI callback never sends a frame over the bridge; it aggregates on the UI
 * runtime and flushes one PII-free summary when the short session ends.
 */
const useAnimationFrameSession = (name: string, durationMs = 260) => {
  const active = useSharedValue(false);
  const elapsedMs = useSharedValue(0);
  const frameCount = useSharedValue(0);
  const longFrameCount = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    const duration = Math.max(0, elapsedMs.value);
    recordPerformance(`${name}.duration`, duration);
    recordPerformance(`${name}.frames`, frameCount.value);
    recordPerformance(`${name}.long_frames`, longFrameCount.value);
    flushPerformanceTrace();
  }, [elapsedMs, frameCount, longFrameCount, name]);

  const frameCallback = useFrameCallback((frame: FrameInfo) => {
    'worklet';
    if (!active.value) return;
    elapsedMs.value = Math.max(0, frame.timeSinceFirstFrame);
    frameCount.value += 1;
    if ((frame.timeSincePreviousFrame ?? 0) > 20) longFrameCount.value += 1;
  }, false);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!active.value) return;
    active.value = false;
    frameCallback.setActive(false);
    finish();
  }, [active, finish, frameCallback]);

  const start = useCallback(() => {
    if (!isPerformanceTraceEnabled) return;
    stop();
    elapsedMs.value = 0;
    frameCount.value = 0;
    longFrameCount.value = 0;
    active.value = true;
    frameCallback.setActive(true);
    timerRef.current = setTimeout(stop, durationMs);
  }, [active, durationMs, elapsedMs, frameCallback, frameCount, longFrameCount, stop]);

  useEffect(() => stop, [stop]);

  return {start, stop};
};

export default useAnimationFrameSession;
