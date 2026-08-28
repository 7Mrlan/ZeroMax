import {useTranslation} from 'react-i18next';
import {selectUserName, setUserName} from '../../redux/slice/userNameSlice';
import {selectUserId} from '../../redux/slice/userIdSlice';
import {
  selectCurrencyCode,
  selectCurrencyId,
  selectCurrencyName,
  selectCurrencySymbol,
  setCurrencyData,
} from '../../redux/slice/currencyDataSlice';
import {useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {getAppVersion} from '../../utils/getVersion';
import {useTheme, ThemeMode} from '../../context/ThemeContext';
import {useDialog} from '../../context/DialogContext';
import {retryMigrations} from '../../backend';
import StorageService from '../../utils/asyncStorageService';
import {updateUserById, updateCurrencyById, deleteAllData} from '../../watermelondb/services';
import {upsertBudget, deleteBudget} from '../../watermelondb/services/budgetService';
import {Linking, Platform} from 'react-native';
import {setIsOnboarded} from '../../redux/slice/isOnboardedSlice';
import {fetchAllData, selectAllData} from '../../redux/slice/allDataSlice';
import {fetchBudgetsByMonth, selectCurrentBudget} from '../../redux/slice/budgetDataSlice';
import {selectMonthIndex, selectYear} from '../../redux/slice/monthSelectionSlice';
import {getMonthNumber, getMonthNames} from '../../utils/dateUtils';
import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {appendErrorLog} from '../../utils/errorLog';

/**
 * Result of an export attempt.
 * - 'saved'     — the file reached somewhere the user can retrieve it.
 * - 'cancelled' — the user dismissed the iOS share sheet; nothing left the app.
 * - 'failed'    — permission denied or the write threw; an error was surfaced.
 */
export type ExportOutcome = 'saved' | 'cancelled' | 'failed';

const useSettings = () => {
  const {t} = useTranslation();
  const userName = useAppSelector(selectUserName);
  const userId = useAppSelector(selectUserId);
  const currencyId = useAppSelector(selectCurrencyId);
  const currencyCode = useAppSelector(selectCurrencyCode);
  const currencyName = useAppSelector(selectCurrencyName);
  const currencySymbol = useAppSelector(selectCurrencySymbol);
  const allData = useAppSelector(selectAllData);

  const selectedMonthIndex = useAppSelector(selectMonthIndex);
  const selectedYear = useAppSelector(selectYear);
  const MONTHS = getMonthNames();
  const yearMonth = `${selectedYear}-${getMonthNumber(MONTHS[selectedMonthIndex])}`;
  const currentBudget = useAppSelector(selectCurrentBudget);

  const {colors, themeMode, setThemeMode} = useTheme();
  const {showDialog, showAlert} = useDialog();
  const appVersion = getAppVersion();

  const dispatch = useAppDispatch();

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchAllData());
      dispatch(fetchBudgetsByMonth(yearMonth));
    }, [dispatch, yearMonth]),
  );

  const handleThemeSelection = useCallback(async (theme: string) => {
    try {
      await setThemeMode(theme as ThemeMode);
    } catch (error) {
      if (__DEV__) {
        console.error('Error saving theme preference:', error);
      }
    }
  }, [setThemeMode]);

  const handleNameUpdate = useCallback(async (newName: string) => {
    if (!userId) return;
    try {
      await updateUserById(userId, {username: newName});
      dispatch(setUserName(newName));
    } catch (error) {
      if (__DEV__) {
        console.error('Error updating the name:', error);
      }
    }
  }, [userId, dispatch]);

  const handleCurrencyUpdate = useCallback(
    async (currency: {code: string; name: string; symbol: string}) => {
      if (!currencyId) return;
      try {
        await updateCurrencyById(currencyId, {
          name: currency.name,
          code: currency.code,
          symbol: currency.symbol,
        });
        const updatedCurrencyData = {
          currencyId,
          currencyName: currency.name,
          currencySymbol: currency.symbol,
          currencyCode: currency.code,
        };
        dispatch(setCurrencyData(updatedCurrencyData));
      } catch (error) {
        if (__DEV__) {
          console.error('Error updating the currency:', error);
        }
      }
    },
    [currencyId, dispatch],
  );

  const handleReportBug = useCallback(() => {
    const bugSheetURL = 'https://docs.google.com/spreadsheets/d/187UDxJbFloEUkxxX29ZJnAI7HSdhAAdSbIcAByc8CDU/edit?usp=sharing';
    Linking.openURL(bugSheetURL).catch(err => {
      if (__DEV__) {
        console.error('Error opening bug report sheet:', err);
      }
    });
  }, []);

  const handleRateNow = useCallback(() => {
    const url = Platform.select({
      ios: 'https://apps.apple.com/app/zero-offline-expense-tracker/id6759560225?action=write-review',
      default: 'https://play.google.com/store/apps/details?id=com.anotherwhy.zero',
    });
    Linking.openURL(url).catch(err => {
      if (__DEV__) {
        console.error('Error opening store:', err);
      }
    });
  }, []);

  const handleGithub = useCallback(() => {
    const githubRepoURL = 'https://github.com/indranilbhuin/zero';
    Linking.openURL(githubRepoURL).catch(err => {
      if (__DEV__) {
        console.error('Error opening GitHub:', err);
      }
    });
  }, []);

  const handlePrivacyPolicy = useCallback(() => {
    const privacyPolicyURL = 'https://lossless.dev/zero/privacy';
    Linking.openURL(privacyPolicyURL).catch(err => {
      if (__DEV__) {
        console.error('Error opening Privacy Policy:', err);
      }
    });
  }, []);

  const handleTermsAndConditions = useCallback(() => {
    const termsURL = 'https://lossless.dev/zero/terms';
    Linking.openURL(termsURL).catch(err => {
      if (__DEV__) {
        console.error('Error opening Terms and Conditions:', err);
      }
    });
  }, []);

  /**
   * Delete-everything flow, with the backup step treated as a real gate.
   *
   * This used to `await exportFn()` for its side effects only and then wipe
   * regardless: a denied Android storage permission, a failed write, or a
   * dismissed iOS share sheet all left the user believing they had a backup
   * while their data was permanently destroyed. Since there is no telemetry,
   * nobody would ever have heard about it.
   *
   * Now: asking for a backup that does not get saved ABORTS the delete. The
   * user can retry or explicitly choose Skip, which is a deliberate,
   * backup-free deletion rather than an accidental one.
   */
  const handleDeleteAllData = useCallback(async (exportFn?: () => Promise<ExportOutcome>) => {
    const wantsBackup = await showDialog({
      type: 'info',
      message: t('settings.deleteBackupPrompt'),
      okLabel: t('settings.export'),
      cancelLabel: t('common.skip'),
    });

    if (wantsBackup && exportFn) {
      const outcome = await exportFn();
      if (outcome !== 'saved') {
        // 'failed' has already surfaced its own error (or the storage-permission
        // dialog); 'cancelled' means the user backed out of the share sheet.
        // Either way there is no backup, so stop before the irreversible step.
        await showAlert({
          type: 'error',
          message: t('settings.deleteBackupFailed'),
        });
        return;
      }
    }

    const confirmed = await showDialog({
      type: 'warning',
      message: t('settings.deleteConfirm'),
    });
    if (!confirmed) return;

    try {
      await deleteAllData();
    } catch (error) {
      // Never leave the user on a "deleted" screen with their data intact.
      appendErrorLog(error instanceof Error ? error : new Error(String(error)), false);
      await showAlert({type: 'error', message: t('settings.deleteFailed')});
      return;
    }
    StorageService.setItemSync('isOnboarded', JSON.stringify(false));
    dispatch(setIsOnboarded(false));
  }, [dispatch, showAlert, showDialog, t]);

  const handleExportResult = useCallback(
    async (success: boolean) => {
      if (success) {
        await showAlert({
          type: 'success',
          message: t('settings.exportSuccess'),
        });
      } else {
        await showAlert({
          type: 'error',
          message: t('settings.exportError'),
        });
      }
    },
    [showAlert, t],
  );

  const handleRetryMigrations = useCallback(async (): Promise<boolean> => {
    const succeeded = await retryMigrations();
    await showAlert({
      type: succeeded ? 'success' : 'error',
      message: succeeded
        ? t('settings.dataWarningRetrySucceeded')
        : t('settings.dataWarningRetryFailed'),
    });
    return succeeded;
  }, [showAlert, t]);

  const requestStorageViaDialog = useCallback(async () => {
    const confirmed = await showDialog({
      type: 'warning',
      message: t('settings.storagePermission'),
    });
    if (confirmed) {
      Linking.openSettings();
    }
  }, [showDialog, t]);

  const handleBudgetSave = useCallback(
    async (amount: number, everyMonth: boolean) => {
      if (!userId) {return;}
      const month = everyMonth ? `recurring:${yearMonth}` : yearMonth;
      try {
        await upsertBudget(userId, amount, month);
      } catch (error) {
        // Was an unguarded await: a failed write rejected into the void, the
        // sheet closed, and the budget simply was not there afterwards.
        appendErrorLog(error instanceof Error ? error : new Error(String(error)), false);
        await showAlert({type: 'error', message: t('settings.budgetSaveFailed')});
        return;
      }
      dispatch(fetchBudgetsByMonth(yearMonth));
    },
    [userId, yearMonth, dispatch, showAlert, t],
  );

  const handleBudgetRemove = useCallback(async () => {
    if (!currentBudget) {return;}
    try {
      await deleteBudget(currentBudget.id);
    } catch (error) {
      appendErrorLog(error instanceof Error ? error : new Error(String(error)), false);
      await showAlert({type: 'error', message: t('settings.budgetSaveFailed')});
      return;
    }
    dispatch(fetchBudgetsByMonth(yearMonth));
  }, [currentBudget, yearMonth, dispatch, showAlert, t]);

  return {
    appVersion,
    colors,
    handleThemeSelection,
    handleNameUpdate,
    handleCurrencyUpdate,
    selectedTheme: themeMode,
    userName,
    currencySymbol,
    currencyCode,
    currencyName,
    currentBudget,
    budgetMonthLabel: `${MONTHS[selectedMonthIndex]} ${selectedYear}`,
    handleBudgetSave,
    handleBudgetRemove,
    handleReportBug,
    handleRateNow,
    handleGithub,
    handlePrivacyPolicy,
    handleTermsAndConditions,
    handleDeleteAllData,
    allData,
    handleExportResult,
    handleRetryMigrations,
    showAlert,
    requestStorageViaDialog,
  };
};

export default useSettings;
