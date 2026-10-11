import React, {useCallback, useState, useSyncExternalStore} from 'react';
import {Alert, TextInput, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useTranslation} from 'react-i18next';
import PrimaryView from '../../components/atoms/PrimaryView';
import AppHeader from '../../components/atoms/AppHeader';
import PrimaryText from '../../components/atoms/PrimaryText';
import PrimaryButton from '../../components/atoms/PrimaryButton';
import useThemeColors from '../../hooks/useThemeColors';
import {
  cancelAiTask,
  createAiTask,
  getAiTasks,
  retryAiTask,
  subscribeAiTasks,
  type AiTask,
} from '../../backend/ai/taskQueue';
import {createNativeAiSecretStore, getAiSettings} from '../../backend/ai/settings';
import {runNextAiTask} from '../../backend/ai/coordinator';
import {getAllCategoriesByUserId} from '../../watermelondb/services';
import {selectUserId} from '../../redux/slice/userIdSlice';
import {useAppSelector} from '../../redux/hooks';
import {goBack} from '../../utils/navigationUtils';
import {gs} from '../../styles/globalStyles';

const AiQueueScreen = () => {
  const colors = useThemeColors();
  const {t} = useTranslation();
  const userId = useAppSelector(selectUserId);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const activeTaskIdRef = React.useRef<string | null>(null);
  const tasks = useSyncExternalStore(subscribeAiTasks, getAiTasks, getAiTasks);
  const retry = useCallback((taskId: string) => {
    retryAiTask(taskId);
  }, []);

  const queueTask = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    createAiTask(trimmed, '');
    setInput('');
  }, [input]);

  const processNext = useCallback(async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const settings = getAiSettings();
      const endpoint = new URL(settings.apiBaseUrl);
      const secretStore = createNativeAiSecretStore();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      await runNextAiTask({
        userId,
        categories: () => getAllCategoriesByUserId(userId),
        secretStore,
        allowedHosts: [endpoint.hostname],
        signal: controller.signal,
        onClaim: task => {
          activeTaskIdRef.current = task.taskId;
        },
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        Alert.alert(t('ai.processFailed'), error instanceof Error ? error.message : t('ai.processFailed'));
      }
    } finally {
      abortControllerRef.current = null;
      activeTaskIdRef.current = null;
      setProcessing(false);
    }
  }, [processing, t, userId]);

  const renderTask = useCallback(
    ({item}: {item: AiTask}) => (
      <View style={[gs.rounded12, gs.px14, gs.py12, gs.mb8, {backgroundColor: colors.containerColor}]}>
        <PrimaryText weight="semibold" numberOfLines={2}>
          {item.input}
        </PrimaryText>
        <PrimaryText size={12} color={colors.secondaryText} style={gs.mt5}>
          {t(`ai.status.${item.status}`)}
        </PrimaryText>
        {item.errorMessage ? (
          <PrimaryText size={12} color={colors.accentRed} style={gs.mt5}>
            {item.errorMessage}
          </PrimaryText>
        ) : null}
        {item.status === 'failed' ? (
          <PrimaryButton
            onPress={() => retry(item.taskId)}
            colors={colors}
            buttonTitle={t('ai.retry')}
            variant="ghost"
            size="sm"
            fullWidth={false}
          />
        ) : null}
        {item.status === 'queued' || item.status === 'running' ? (
          <PrimaryButton
            testID={`ai-cancel-${item.taskId}`}
            onPress={() => {
              cancelAiTask(item.taskId);
              if (activeTaskIdRef.current === item.taskId) abortControllerRef.current?.abort();
            }}
            colors={colors}
            buttonTitle={t('ai.cancel')}
            variant="ghost"
            size="sm"
            fullWidth={false}
          />
        ) : null}
      </View>
    ),
    [colors, retry, t],
  );

  return (
    <PrimaryView colors={colors} useSidePadding={false}>
      <AppHeader onPress={goBack} colors={colors} text={t('ai.queueTitle')} />
      <PrimaryText size={12} color={colors.secondaryText} style={gs.mt10}>
        {t('ai.privacyNotice')}
      </PrimaryText>
      <TextInput
        testID="ai-queue-input"
        accessibilityLabel={t('ai.capturePlaceholder')}
        value={input}
        onChangeText={setInput}
        maxLength={10_000}
        multiline
        placeholder={t('ai.capturePlaceholder')}
        placeholderTextColor={colors.secondaryText}
        style={[
          gs.mt15,
          gs.px12,
          gs.py10,
          gs.rounded8,
          {color: colors.primaryText, backgroundColor: colors.containerColor},
        ]}
      />
      <View style={[gs.row, gs.gap8, gs.mt10]}>
        <PrimaryButton
          testID="ai-queue-add"
          onPress={queueTask}
          colors={colors}
          buttonTitle={t('ai.queueTask')}
          disabled={!input.trim()}
          size="sm"
          fullWidth={false}
        />
        <PrimaryButton
          testID="ai-queue-process"
          onPress={() => void processNext()}
          colors={colors}
          buttonTitle={processing ? t('ai.status.running') : t('ai.processNext')}
          disabled={processing || !userId}
          variant="outline"
          size="sm"
          fullWidth={false}
        />
      </View>
      <FlashList
        data={tasks}
        renderItem={renderTask}
        keyExtractor={task => task.taskId}
        contentContainerStyle={gs.mt15}
        ListEmptyComponent={<PrimaryText color={colors.secondaryText}>{t('ai.empty')}</PrimaryText>}
      />
    </PrimaryView>
  );
};

export default AiQueueScreen;
