import {ScrollView, TouchableOpacity, View, Platform, Share} from 'react-native';
import React, {useCallback, useState} from 'react';
import {useTranslation} from 'react-i18next';
import i18n from '../../i18n';
import Icon from '../../components/atoms/Icons';
import {goBack, navigate} from '../../utils/navigationUtils';
import useSettings, {type ExportOutcome} from './useSettings';
import PrimaryView from '../../components/atoms/PrimaryView';
import PrimaryText from '../../components/atoms/PrimaryText';
import useFormatAmount from '../../hooks/useFormatAmount';
import RNFS from 'react-native-fs';
import {requestStoragePermission} from '../../utils/dataUtils';
import {generateUniqueKey} from '../../backend/export/key';
import {getTimestamp} from '../../utils/dateUtils';
import {CURRENT_EXPORT_VERSION} from '../../backend/export/format';
import {expensesToCsv} from '../../backend/export/csv';
import {SheetManager} from 'react-native-actions-sheet';
import {setLocaleOverride} from '../../utils/locale';
import {getWeekStartDay, setWeekStartDay, type WeekStartDay} from '../../utils/weekStart';
import {getWeekdayNames} from '../../utils/dateUtils';
import {hasMigrationFailed} from '../../backend';
import {Colors} from '../../hooks/useThemeColors';
import {gs, hitSlop} from '../../styles/globalStyles';

interface SettingsRowProps {
  icon: string;
  label: string;
  subtitle?: string;
  value?: string;
  valueNode?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  colors: Colors;
}

const SettingsRow: React.FC<SettingsRowProps> = ({icon, label, subtitle, value, valueNode, onPress, destructive, colors}) => (
  <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.6 : 1} disabled={!onPress}>
    <View style={[gs.rowCenter, gs.px14, gs.py12, gs.gap10]}>
      <View style={[gs.size32, gs.rounded8, gs.center, {backgroundColor: colors.secondaryAccent}]}>
        <Icon name={icon} size={16} color={destructive ? colors.accentOrange : colors.secondaryText} />
      </View>
      <View style={[gs.flex1, gs.gap2]}>
        <PrimaryText size={14} weight="medium" color={destructive ? colors.accentOrange : colors.primaryText}>
          {label}
        </PrimaryText>
        {subtitle ? (
          <PrimaryText size={11} color={colors.secondaryText}>{subtitle}</PrimaryText>
        ) : null}
      </View>
      {value ? (
        <PrimaryText size={13} color={colors.secondaryText}>{value}</PrimaryText>
      ) : null}
      {valueNode ?? null}
      {onPress ? <Icon name="chevron-right" size={14} color={colors.secondaryText} /> : null}
    </View>
  </TouchableOpacity>
);

const SettingsScreen = () => {
  const {t} = useTranslation();
  const {
    appVersion,
    colors,
    handleThemeSelection,
    handleNameUpdate,
    handleCurrencyUpdate,
    selectedTheme,
    userName,
    currencySymbol,
    currencyCode,
    currencyName,
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
    currentBudget,
    budgetMonthLabel,
    handleBudgetSave,
    handleBudgetRemove,
  } = useSettings();
  const formatAmount = useFormatAmount();

  const handleOpenBudgetSheet = useCallback(() => {
    void SheetManager.show('budget-sheet', {
      payload: {
        currentAmount: currentBudget?.amount,
        currencySymbol,
        currencyCode,
        isRecurring: currentBudget?.month.startsWith('recurring') ?? false,
        monthLabel: budgetMonthLabel,
        onSave: handleBudgetSave,
        onRemove: handleBudgetRemove,
      },
    });
  }, [currentBudget, currencySymbol, currencyCode, budgetMonthLabel, handleBudgetSave, handleBudgetRemove]);

  const handleOpenCurrencySheet = useCallback(() => {
    void SheetManager.show('currency-picker-sheet', {
      payload: {
        selectedCurrency: {code: '', name: currencyName, symbol: currencySymbol},
        onSelect: (currency: {code: string; name: string; symbol: string}) => {
          handleCurrencyUpdate(currency);
        },
      },
    });
  }, [currencyName, currencySymbol, handleCurrencyUpdate]);

  /**
   * Shared write path for every export format. Returns whether the bytes
   * reached somewhere the USER can actually get at, which is not the same as
   * "no exception was thrown":
   *
   * - iOS writes to DocumentDirectoryPath, which is app-private (Info.plist
   *   sets neither UIFileSharingEnabled nor LSSupportsOpeningDocumentsInPlace).
   *   The share sheet is the only way the file escapes the sandbox, so a
   *   DISMISSED share means there is no usable backup, however successful the
   *   write was.
   * - Android writes straight to Downloads, permission-gated on API <= 32. A
   *   denied permission used to return silently here — no error, no result —
   *   so the caller could not tell a refusal from a success.
   *
   * `handleDeleteAllData` gates a permanent wipe on this boolean, so it must
   * never report optimistically.
   */
  const writeAndShareFile = async (fileName: string, contents: string): Promise<ExportOutcome> => {
    try {
      if (Platform.OS === 'ios') {
        const path = `${RNFS.DocumentDirectoryPath}/${fileName}`;
        await RNFS.writeFile(path, contents, 'utf8');
        const result = await Share.share({
          url: `file://${path}`,
          title: t('settings.exportShareTitle'),
        });
        if (result.action === Share.dismissedAction) {
          return 'cancelled';
        }
        handleExportResult(true);
        return 'saved';
      }

      const storagePermissionGranted = await requestStoragePermission();
      if (!storagePermissionGranted) {
        requestStorageViaDialog();
        return 'failed';
      }
      const path = `${RNFS.DownloadDirectoryPath}/${fileName}`;
      await RNFS.writeFile(path, contents, 'utf8');
      handleExportResult(true);
      return 'saved';
    } catch (error) {
      if (__DEV__) {
        console.error('Error saving file:', error);
      }
      handleExportResult(false);
      return 'failed';
    }
  };

  // handleDeleteAllData awaits this as its backup-before-delete step and will
  // NOT wipe unless it returns 'saved'.
  const exportData = async (dataToExport: unknown): Promise<ExportOutcome> => {
    if (!dataToExport) {
      handleExportResult(false);
      return 'failed';
    }
    const fileName = `zero_v${CURRENT_EXPORT_VERSION}_${getTimestamp()}.json`;
    const jsonData = JSON.stringify(
      {key: generateUniqueKey(), version: CURRENT_EXPORT_VERSION, data: dataToExport},
      null,
      2,
    );
    return writeAndShareFile(fileName, jsonData);
  };

  // One-way spreadsheet export; JSON stays the only restore format.
  const exportCsv = async (): Promise<ExportOutcome> => {
    if (!allData) {
      handleExportResult(false);
      return 'failed';
    }
    return writeAndShareFile(`zero_expenses_${getTimestamp()}.csv`, expensesToCsv(allData.expenses));
  };

  const [migrationFailed, setMigrationFailed] = useState(hasMigrationFailed());

  const handleRetryPress = useCallback(async () => {
    const succeeded = await handleRetryMigrations();
    if (succeeded) {
      setMigrationFailed(false);
    }
  }, [handleRetryMigrations]);

  const handleOpenDiagnostics = useCallback(() => {
    navigate('DiagnosticsScreen');
  }, []);

  // Protocol R4: disclose the irreducible residue in plain language, in-app,
  // rather than only on the website.
  const handleOpenNoiseFloor = useCallback(() => {
    void showAlert({
      type: 'info',
      message: t('settings.whatLeavesDeviceBody'),
      // Structured rather than "\n• ..." inside the message: the message is
      // centre-aligned, so bullets written into it wrapped to ragged widths
      // with no left edge and no spacing. Four points, each one something the
      // user can actually act on.
      bullets: [
        {icon: 'shopping-bag', text: t('settings.whatLeavesDeviceStore')},
        {icon: 'share-2', text: t('settings.whatLeavesDeviceExports')},
        {icon: 'hard-drive', text: t('settings.whatLeavesDeviceBackup')},
        {icon: 'eye-off', text: t('settings.whatLeavesDeviceAccess')},
      ],
    });
  }, [showAlert, t]);

  // Week-start preference: local state mirrors MMKV so the row updates
  // immediately after the sheet applies a change.
  const [weekStart, setWeekStart] = useState<WeekStartDay>(getWeekStartDay);
  const weekStartLabel = getWeekdayNames()[weekStart === 'monday' ? 1 : 0];

  const openWeekStartPicker = useCallback(() => {
    void SheetManager.show('week-start-picker-sheet', {
      payload: {
        current: weekStart,
        onSelect: (day: 'sunday' | 'monday') => {
          setWeekStartDay(day);
          setWeekStart(day);
        },
      },
    });
  }, [weekStart]);

  const openThemePicker = useCallback(() => {
    void SheetManager.show('theme-picker-sheet', {
      payload: {
        currentTheme: selectedTheme,
        onSelect: (theme: string) => {
          handleThemeSelection(theme);
        },
      },
    });
  }, [selectedTheme, handleThemeSelection]);

  // Deliberately NOT dismissKeyboardOnTouch: this screen has no text input
  // (name, currency and budget are all edited in sheets), and the wrapper it
  // adds swallows the touch responder before the ScrollView can have it — see
  // the note in PrimaryView.
  return (
    <PrimaryView colors={colors}>
      <View style={[gs.rowCenter, gs.gap10, gs.mt5p]}>
        <TouchableOpacity onPress={() => goBack()} hitSlop={hitSlop}>
          <Icon name="arrow-left" size={22} color={colors.primaryText} />
        </TouchableOpacity>
        <PrimaryText size={22} weight="semibold">{t('settings.title')}</PrimaryText>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={gs.pb80}>
        {migrationFailed ? (
          <View
            style={[
              gs.rounded12,
              gs.px14,
              gs.py12,
              gs.mt20,
              gs.rowCenter,
              gs.gap10,
              {backgroundColor: colors.containerColor, borderWidth: 1, borderColor: colors.accentOrange},
            ]}>
            <Icon name="alert-triangle" size={18} color={colors.accentOrange} />
            <View style={gs.flex1}>
              <PrimaryText size={13} weight="semibold" color={colors.accentOrange}>
                {t('settings.dataWarningTitle')}
              </PrimaryText>
              <PrimaryText size={11} color={colors.secondaryText} style={gs.mt2}>
                {t('settings.dataWarningMessage')}
              </PrimaryText>
              <TouchableOpacity onPress={handleRetryPress} hitSlop={hitSlop} style={gs.mt6}>
                <PrimaryText size={12} weight="semibold" color={colors.accentGreen}>
                  {t('settings.dataWarningRetry')}
                </PrimaryText>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <PrimaryText
          size={11}
          weight="semibold"
          color={colors.accentGreen}
          style={[gs.mt20, gs.mb6, {letterSpacing: 0.8}]}>
          {t('settings.sectionPersonalization')}
        </PrimaryText>
        <View style={[gs.rounded12, gs.overflowHidden, {backgroundColor: colors.containerColor}]}>
          <SettingsRow
            colors={colors}
            icon="sun-moon"
            label={t('settings.theme')}
            value={selectedTheme === 'light' ? t('settings.themeLight') : selectedTheme === 'dark' ? t('settings.themeDark') : t('settings.themeSystem')}
            onPress={openThemePicker}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="user"
            label={t('settings.name')}
            value={userName}
            onPress={() => {
              void SheetManager.show('change-name-sheet', {
                payload: {
                  currentName: userName,
                  onUpdate: (newName: string) => {
                    handleNameUpdate(newName);
                  },
                },
              });
            }}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="banknote"
            label={t('settings.currency')}
            onPress={handleOpenCurrencySheet}
            valueNode={
              <View style={gs.itemsEnd}>
                <PrimaryText size={13} color={colors.secondaryText} variant="number">{currencySymbol}</PrimaryText>
                <PrimaryText size={10} color={colors.secondaryText}>{currencyName}</PrimaryText>
              </View>
            }
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="target"
            label={t('settings.budget')}
            subtitle={t('settings.budgetSubtitle')}
            value={currentBudget ? formatAmount(currentBudget.amount) : undefined}
            onPress={handleOpenBudgetSheet}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="globe"
            label={t('settings.language')}
            value={t('settings.currentLanguage')}
            onPress={() => {
              void SheetManager.show('language-picker-sheet', {
                payload: {
                  currentLanguage: i18n.language,
                  onSelect: (lang: string) => {
                    setLocaleOverride(lang === 'en' ? null : lang);
                  },
                },
              });
            }}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="calendar-days"
            label={t('settings.weekStart')}
            value={weekStartLabel}
            onPress={openWeekStartPicker}
          />
        </View>

        <PrimaryText
          size={11}
          weight="semibold"
          color={colors.accentGreen}
          style={[gs.mt20, gs.mb6, {letterSpacing: 0.8}]}>
          {t('settings.sectionData')}
        </PrimaryText>
        <View style={[gs.rounded12, gs.overflowHidden, {backgroundColor: colors.containerColor}]}>
          <SettingsRow
            colors={colors}
            icon="download"
            label={t('settings.exportData')}
            subtitle={t('settings.exportSubtitle')}
            onPress={() => exportData(allData)}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="file-spreadsheet"
            label={t('settings.exportCsv')}
            subtitle={t('settings.exportCsvSubtitle')}
            onPress={() => exportCsv()}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="trash-2"
            label={t('settings.deleteAllData')}
            subtitle={t('settings.deleteSubtitle')}
            onPress={() => handleDeleteAllData(() => exportData(allData))}
            destructive
          />
        </View>

        <PrimaryText
          size={11}
          weight="semibold"
          color={colors.accentGreen}
          style={[gs.mt20, gs.mb6, {letterSpacing: 0.8}]}>
          {t('settings.sectionAbout')}
        </PrimaryText>
        <View style={[gs.rounded12, gs.overflowHidden, {backgroundColor: colors.containerColor}]}>
          <SettingsRow
            colors={colors}
            icon="bug"
            label={t('settings.reportBug')}
            subtitle={t('settings.reportBugSubtitle')}
            onPress={handleReportBug}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="star"
            label={t('settings.rateApp')}
            subtitle={t('settings.rateAppSubtitle')}
            onPress={handleRateNow}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="code"
            label={t('settings.sourceCode')}
            subtitle={t('settings.sourceCodeSubtitle')}
            onPress={handleGithub}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="activity"
            label={t('settings.diagnostics')}
            subtitle={t('settings.diagnosticsSubtitle')}
            onPress={handleOpenDiagnostics}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="wifi-off"
            label={t('settings.whatLeavesDevice')}
            subtitle={t('settings.whatLeavesDeviceSubtitle')}
            onPress={handleOpenNoiseFloor}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="shield"
            label={t('settings.privacyPolicy')}
            onPress={handlePrivacyPolicy}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="file-text"
            label={t('settings.termsAndConditions')}
            onPress={handleTermsAndConditions}
          />
          <View style={[gs.mx16, {height: 1, backgroundColor: colors.secondaryAccent}]} />
          <SettingsRow
            colors={colors}
            icon="info"
            label={t('settings.version')}
            value={`v${appVersion}`}
          />
        </View>

        <View style={[gs.mt20, gs.mb10, gs.center, gs.gap2]}>
          <PrimaryText size={11} color={colors.secondaryText}>
            {t('settings.footerTagline')}
          </PrimaryText>
          <PrimaryText size={11} color={colors.secondaryText}>
            {t('settings.footerMadeWith')}
          </PrimaryText>
        </View>
      </ScrollView>

    </PrimaryView>
  );
};

export default SettingsScreen;
