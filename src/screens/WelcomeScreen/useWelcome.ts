import {useCallback} from 'react';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import useThemeColors from '../../hooks/useThemeColors';
import type {OnboardingStackParamList} from '../../navigation/types';

type WelcomeNavigation = NativeStackNavigationProp<OnboardingStackParamList, 'WelcomeScreen'>;

const useWelcome = () => {
  const colors = useThemeColors();
  const navigation = useNavigation<WelcomeNavigation>();

  const handleAlreadyUser = useCallback(() => {
    navigation.push('ExistingUserScreen');
  }, [navigation]);

  const handleNewUser = useCallback(() => {
    // BootGate only presents Welcome for a fresh/empty target. Keep the
    // transition synchronous; a destructive full-database writer here can
    // block the first JSI frame and strand the user on Welcome.
    navigation.push('PersonalizeScreen');
  }, [navigation]);

  return {
    colors,
    handleAlreadyUser,
    handleNewUser,
  };
};

export default useWelcome;
