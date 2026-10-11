import {useState, useCallback} from 'react';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import useThemeColors from '../../hooks/useThemeColors';
import {createUser} from '../../watermelondb/services';
import type {OnboardingStackParamList} from '../../navigation/types';
import {nameSchema} from '../../utils/validationSchema';
import {appendErrorLog} from '../../utils/errorLog';

type PersonalizeNavigation = NativeStackNavigationProp<OnboardingStackParamList, 'PersonalizeScreen'>;

const usePersonalize = () => {
  const colors = useThemeColors();
  const navigation = useNavigation<PersonalizeNavigation>();
  const [name, setName] = useState('');

  const handleSubmit = useCallback(async () => {
    try {
      await nameSchema.parseAsync(name);
      await createUser(name, '');
      navigation.push('OnboardingScreen');
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      appendErrorLog(normalized);
      console.error('Personalize onboarding submit failed:', normalized);
      if (__DEV__) {
        console.error('Error saving user data:', normalized);
      }
    }
  }, [name, navigation]);

  const handleSkip = useCallback(async () => {
    try {
      await createUser('User', '');
      navigation.push('OnboardingScreen');
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      appendErrorLog(normalized);
      console.error('Personalize onboarding skip failed:', normalized);
      if (__DEV__) {
        console.error('Error saving demo user data:', normalized);
      }
    }
  }, [navigation]);

  return {
    colors,
    setName,
    name,
    handleSubmit,
    handleSkip,
    nameSchema,
  };
};

export default usePersonalize;
