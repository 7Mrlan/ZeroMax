import {NativeModules, Platform} from 'react-native';

interface NativePerformanceTrace {
  enabled?: boolean;
  mark?: (name: string) => void;
  record?: (name: string, durationMs: number) => void;
  flush?: () => void;
}

const nativeTrace: NativePerformanceTrace | undefined =
  Platform.OS === 'android' ? (NativeModules.ZeroPerformance as NativePerformanceTrace | undefined) : undefined;

export const isPerformanceTraceEnabled = nativeTrace?.enabled === true;

const validName = (name: string): boolean => /^[a-zA-Z0-9._-]{1,80}$/.test(name);

const now = (): number => {
  const runtime = globalThis as typeof globalThis & {performance?: {now?: () => number}};
  return typeof runtime.performance?.now === 'function' ? runtime.performance.now() : Date.now();
};

export const markPerformance = (name: string): void => {
  if (!isPerformanceTraceEnabled || !validName(name)) return;
  nativeTrace?.mark?.(name);
};

export const recordPerformance = (name: string, durationMs: number): void => {
  if (!isPerformanceTraceEnabled || !validName(name) || !Number.isFinite(durationMs) || durationMs < 0) return;
  nativeTrace?.record?.(name, durationMs);
};

export const flushPerformanceTrace = (): void => {
  if (!isPerformanceTraceEnabled) return;
  nativeTrace?.flush?.();
};

export const measurePerformance = async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
  if (!isPerformanceTraceEnabled || !validName(name)) return operation();
  const start = now();
  markPerformance(`${name}.start`);
  try {
    return await operation();
  } finally {
    const end = now();
    recordPerformance(name, Math.max(0, end - start));
  }
};
