import useThemeColors from '../../hooks/useThemeColors';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Linking, Platform} from 'react-native';
import {requestStoragePermission} from '../../utils/dataUtils';
import {isValidExportKey} from '../../backend/export/key';
import {useDialog} from '../../context/DialogContext';
import {pick, types, isErrorWithCode, errorCodes} from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import {getAllUsers, importAllData} from '../../watermelondb/services';
import {fetchCategories} from '../../redux/slice/categoryDataSlice';
import {fetchDebtors} from '../../redux/slice/debtorDataSlice';
import {fetchUserData} from '../../redux/slice/userIdSlice';
import {fetchCurrency} from '../../redux/slice/currencyDataSlice';
import {fetchExpenses} from '../../redux/slice/expenseDataSlice';
import {fetchAllDebts} from '../../redux/slice/debtDataSlice';
import StorageService from '../../utils/asyncStorageService';
import {setIsOnboarded} from '../../redux/slice/isOnboardedSlice';
import {useAppDispatch} from '../../redux/hooks';
import {refreshYearsCache} from '../../utils/availableYearsCache';
import {upgradeExportData} from '../../backend/export/upgrader';
import type {ExportData} from '../../backend/export/format';
import {validateExportEnvelope} from '../../backend/export/validate';

type ImportedData = ExportData;

type EntityStatus = 'pending' | 'syncing' | 'done' | 'error';

interface SyncStatus {
  user: EntityStatus;
  categories: EntityStatus;
  debtors: EntityStatus;
  currencies: EntityStatus;
  expenses: EntityStatus;
  debts: EntityStatus;
  budgets: EntityStatus;
}

interface SyncStats {
  categories: number;
  expenses: number;
  debtors: number;
  debts: number;
  budgets: number;
  autoCreated: number;
}

const allStatuses = (status: EntityStatus): SyncStatus => ({
  user: status,
  categories: status,
  debtors: status,
  currencies: status,
  expenses: status,
  debts: status,
  budgets: status,
});

const EMPTY_STATS: SyncStats = {
  categories: 0,
  expenses: 0,
  debtors: 0,
  debts: 0,
  budgets: 0,
  autoCreated: 0,
};

const useExistingUser = () => {
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const {showDialog} = useDialog();
  const {t} = useTranslation();

  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState(t('existingUser.uploadFile'));
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncComplete, setIsSyncComplete] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(allStatuses('pending'));
  const [syncStats, setSyncStats] = useState<SyncStats>(EMPTY_STATS);

  const normalizePath = (path: string | undefined): string => {
    try {
      if (path === undefined) {
        throw new Error('Path is undefined');
      }
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        const filePrefix = 'file:';
        if (path.startsWith(filePrefix)) {
          path = path.substring(filePrefix.length);
        }
        path = decodeURI(path);
      }
      return path;
    } catch (e) {
      if (__DEV__) {
        console.error({msg: 'Failed to normalize path', data: e});
      }
      return '';
    }
  };

  const refreshStores = async () => {
    // fetchUserData must resolve FIRST: the entity thunks read userId from
    // redux state and would otherwise query with the stale/empty id.
    await dispatch(fetchUserData());
    dispatch(fetchCategories());
    dispatch(fetchDebtors());
    dispatch(fetchCurrency());
    dispatch(fetchExpenses());
    dispatch(fetchAllDebts());
    // Budgets are month-scoped; Home/Reports refetch them on focus.
  };

  const importData = async () => {
    try {
      setIsSyncing(false);
      setIsSyncComplete(false);
      setSyncError(null);
      setSyncStatus(allStatuses('pending'));
      setSyncStats(EMPTY_STATS);

      const storagePermissionGranted = await requestStoragePermission();

      if (!storagePermissionGranted) {
        const confirmed = await showDialog({
          type: 'warning',
          message: t('existingUser.storagePermissionRequired'),
        });
        if (confirmed) {
          Linking.openSettings();
        }
        return;
      }

      let result;
      try {
        result = await pick({
          type: [types.allFiles],
          allowMultiSelection: false,
        });
      } catch (pickError) {
        if (isErrorWithCode(pickError) && pickError.code === errorCodes.OPERATION_CANCELED) {
          return;
        }
        throw pickError;
      }

      const {0: res} = result;
      const path = normalizePath(res.uri);
      if (!path) {
        setUploadMessage(t('existingUser.invalidFilePath'));
        return;
      }

      const fileContent = await RNFS.readFile(path, 'utf8');

      let jsonData: unknown;
      try {
        jsonData = JSON.parse(fileContent);
      } catch {
        setUploadMessage(t('existingUser.invalidJson'));
        return;
      }

      const validation = validateExportEnvelope(jsonData);
      if (!validation.success || !validation.data) {
        setUploadMessage(validation.error ?? t('existingUser.invalidExport'));
        return;
      }

      const envelope = validation.data;
      if (!isValidExportKey(envelope.key)) {
        setUploadMessage(t('existingUser.invalidKey'));
        return;
      }

      const data: ImportedData = upgradeExportData(envelope);

      // The file is valid — only NOW may existing data be touched, and only
      // with consent. The wipe itself happens inside importAllData's single
      // transaction, so cancelling here (or a failure later) loses nothing.
      const existingUsers = await getAllUsers();
      if (existingUsers.length > 0) {
        const confirmed = await showDialog({
          type: 'warning',
          message: t('existingUser.replaceDataWarning'),
        });
        if (!confirmed) {
          return;
        }
      }

      setFileName(res.name ?? 'data.json');
      setUploadMessage(t('existingUser.syncingData'));
      setIsSyncing(true);
      setSyncStatus(allStatuses('syncing'));

      const {userId, stats} = await importAllData(data);

      // Refetch failures must not mark a committed import as failed.
      try {
        // The year cache is keyed by user id and the import minted a new one;
        // rebuild it so the month picker reflects the restored data.
        await refreshYearsCache(userId);
        await refreshStores();
      } catch (refreshError) {
        if (__DEV__) {
          console.error('Error refreshing stores after import:', refreshError);
        }
      }

      setSyncStatus(allStatuses('done'));
      setSyncStats({
        categories: stats.categories,
        expenses: stats.expenses,
        debtors: stats.debtors,
        debts: stats.debts,
        budgets: stats.budgets,
        autoCreated: stats.autoCreatedCategories + stats.autoCreatedDebtors,
      });
      setIsSyncing(false);
      setIsSyncComplete(true);
      setUploadMessage(t('existingUser.allDataSynced'));
    } catch (error) {
      if (__DEV__) {
        console.error('Error importing data:', error);
      }
      setIsSyncing(false);
      setSyncStatus(allStatuses('error'));
      setSyncError(t('existingUser.syncFailed'));
      setUploadMessage(t('existingUser.syncError'));
    }
  };

  const reUpload = async () => {
    // No pre-wipe: importData validates the new file and swaps data
    // atomically, so a cancelled picker or bad file can't lose anything.
    setFileName(null);
    setIsSyncComplete(false);
    setSyncError(null);
    setSyncStats(EMPTY_STATS);
    await importData();
  };

  const handleContinue = async () => {
    StorageService.setItemSync('isOnboarded', JSON.stringify(true));
    dispatch(setIsOnboarded(true));
  };

  return {
    colors,
    importData,
    fileName,
    uploadMessage,
    reUpload,
    handleContinue,
    isSyncing,
    isSyncComplete,
    syncError,
    syncStatus,
    syncStats,
  };
};

export default useExistingUser;
