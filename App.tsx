import i18n from './src/i18n';
import React, {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {setNavigationRef} from './src/utils/navigationUtils';
import {Provider} from 'react-redux';
import store, {persistor} from './src/redux/store';
import {PersistGate} from 'redux-persist/integration/react';
import MainStack from './src/navigation/MainStack';
import {View, Text, Appearance, StyleSheet, TouchableOpacity} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {ThemeProvider} from './src/context/ThemeContext';
import {DialogProvider} from './src/context/DialogContext';
import {SheetProvider} from 'react-native-actions-sheet';
import ErrorBoundary from './src/components/atoms/ErrorBoundary';
import {initBackend, retryBackend, type BackendInitResult} from './src/backend';
import './src/sheets/sheets';
import './src/utils/globalErrorHandler';

// Deliberately renders outside every provider (like ErrorBoundary): plain
// Text + Appearance, because ThemeProvider is unavailable when the DB fails.
interface InitializationErrorFallbackProps {
  result: Extract<BackendInitResult, {ok: false}>;
  onRetry: () => void;
}

const InitializationErrorFallback = ({result, onRetry}: InitializationErrorFallbackProps) => {
  const isDark = Appearance.getColorScheme() === 'dark';
  const textColor = isDark ? '#fff' : '#000';
  return (
    <View style={[dbStyles.container, isDark ? dbStyles.darkBackground : dbStyles.lightBackground]}>
      <Text style={[dbStyles.face, {color: textColor}]}>:(</Text>
      <Text style={[dbStyles.title, {color: textColor}]}>
        {i18n.t(result.kind === 'migration' ? 'migrationError.title' : 'databaseError.title')}
      </Text>
      <Text style={dbStyles.subtitle}>
        {i18n.t(result.kind === 'migration' ? 'migrationError.message' : 'databaseError.message')}
      </Text>
      {__DEV__ ? (
        <Text testID="initialization-error-detail" style={dbStyles.subtitle}>
          {result.error.message}
        </Text>
      ) : null}
      {result.retryable ? (
        <TouchableOpacity
          onPress={onRetry}
          style={dbStyles.retryButton}
          accessibilityRole="button"
          accessibilityLabel={i18n.t('databaseError.retry')}>
          <Text style={dbStyles.retryText}>{i18n.t('databaseError.retry')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const dbStyles = StyleSheet.create({
  appRoot: {flex: 1},
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32},
  darkBackground: {backgroundColor: '#000'},
  lightBackground: {backgroundColor: '#fff'},
  face: {fontSize: 40, fontWeight: 'bold'},
  title: {fontSize: 16, fontWeight: '600', marginTop: 16, textAlign: 'center'},
  subtitle: {fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center', lineHeight: 20},
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#6E8B3D',
  },
  retryText: {fontSize: 14, fontWeight: '600', color: '#fff'},
});

type BackendInitFailure = Extract<BackendInitResult, {ok: false}>;
type InitState = {status: 'pending'} | {status: 'ready'} | {status: 'failed'; result: BackendInitFailure};

const App = () => {
  const [initState, setInitState] = useState<InitState>({status: 'pending'});
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Await SQLite setup and data migrations before mounting screens.
    const init = async () => {
      try {
        const result = await (retryAttempt === 0 ? initBackend() : retryBackend());
        if (cancelled) {
          return;
        }
        if (result.ok) {
          setInitState({status: 'ready'});
        } else {
          setInitState({status: 'failed', result});
        }
      } catch (error) {
        if (!cancelled) {
          setInitState({
            status: 'failed',
            result: {
              ok: false,
              kind: 'database',
              retryable: true,
              error: error instanceof Error ? error : new Error(String(error)),
            },
          });
        }
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [retryAttempt]);

  if (initState.status === 'failed') {
    return (
      <InitializationErrorFallback
        result={initState.result}
        onRetry={() => {
          setInitState({status: 'pending'});
          setRetryAttempt(value => value + 1);
        }}
      />
    );
  }
  if (initState.status === 'pending') {
    // The native splash/launch screen is still on screen; render nothing.
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView>
        <SafeAreaProvider>
          <Provider store={store}>
            <PersistGate loading={null} persistor={persistor}>
              <ThemeProvider>
                <DialogProvider>
                  <SheetProvider>
                    <NavigationContainer ref={setNavigationRef}>
                      <View style={dbStyles.appRoot}>
                        <MainStack />
                      </View>
                    </NavigationContainer>
                  </SheetProvider>
                </DialogProvider>
              </ThemeProvider>
            </PersistGate>
          </Provider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
};

export default App;
