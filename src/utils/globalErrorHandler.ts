import {appendErrorLog} from './errorLog';

const g = globalThis as any;

const defaultHandler = g.ErrorUtils?.getGlobalHandler?.();

g.ErrorUtils?.setGlobalHandler?.(
  (error: Error, isFatal?: boolean) => {
    appendErrorLog(error, !!isFatal);

    if (__DEV__) {
      console.error('[GlobalErrorHandler]', isFatal ? 'FATAL' : 'NON-FATAL', error);
      defaultHandler?.(error, isFatal);
      return;
    }

    // Non-fatal errors are recorded and swallowed on purpose: they are already
    // captured above, and letting RN surface them in production would show a
    // red box over a finance app for a recoverable problem.
    if (!isFatal) {
      return;
    }

    // Fatals ALWAYS go to the default handler. Swallowing them (as this used
    // to do on Android) left the app running in an undefined state with no
    // crash and no restart — strictly worse than crashing.
    defaultHandler?.(error, isFatal);
  },
);

/**
 * Unhandled promise rejections.
 *
 * `globalThis.onunhandledrejection` is a web API and never fires under Hermes.
 * React Native installs Hermes' own tracker, but only inside `if (__DEV__)`
 * (Libraries/Core/polyfillPromise.js) — so in production, rejections were
 * silently lost. Install our own tracker for release builds only, which
 * therefore cannot clash with RN's dev one.
 */
if (!__DEV__) {
  g.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id: number, rejection: unknown) => {
      const error =
        rejection instanceof Error
          ? rejection
          : new Error(`Unhandled promise rejection: ${String(rejection)}`);
      appendErrorLog(error, false);
    },
    onHandled: () => {
      // A rejection handled after the fact needs no action; the log entry
      // stays as a record that it happened.
    },
  });
}
