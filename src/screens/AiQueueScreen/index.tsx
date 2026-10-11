import React, {useCallback, useSyncExternalStore} from 'react';
import {View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useTranslation} from 'react-i18next';
import PrimaryView from '../../components/atoms/PrimaryView';
import AppHeader from '../../components/atoms/AppHeader';
import PrimaryText from '../../components/atoms/PrimaryText';
import PrimaryButton from '../../components/atoms/PrimaryButton';
import useThemeColors from '../../hooks/useThemeColors';
import {getAiTasks, retryAiTask, subscribeAiTasks, type AiTask} from '../../backend/ai/taskQueue';
import {goBack} from '../../utils/navigationUtils';
import {gs} from '../../styles/globalStyles';

const AiQueueScreen = () => {
  const colors = useThemeColors();
  const {t} = useTranslation();
  const tasks = useSyncExternalStore(subscribeAiTasks, getAiTasks, getAiTasks);
  const retry = useCallback((taskId: string) => {
    retryAiTask(taskId);
  }, []);

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
