import {NavigationContainerRef, CommonActions} from '@react-navigation/native';
import type {HomeStackParamList, OnboardingStackParamList} from '../navigation/types';

type AllScreens = HomeStackParamList & OnboardingStackParamList;

let navigationRef: NavigationContainerRef<HomeStackParamList> | null = null;

export const setNavigationRef = (ref: NavigationContainerRef<HomeStackParamList>) => {
  navigationRef = ref;
};

export const navigate = <T extends keyof AllScreens>(
  name: T,
  ...args: AllScreens[T] extends undefined ? [] : [AllScreens[T]]
) => {
  if (navigationRef) {
    navigationRef.dispatch(CommonActions.navigate({name: name as string, params: args[0]}));
  } else if (__DEV__) {
    console.error(
      'Navigation reference is not set. Make sure to call setNavigationRef.',
    );
  }
};

/**
 * Goes back, then runs `action` — but ONLY if the navigation actually
 * happened. The callback used to run unconditionally, so a null ref produced
 * a screen that stayed put while its "we have left this screen" side effect
 * fired anyway. Returns whether the navigation was dispatched.
 */
export const goBack = (action?: () => void): boolean => {
  if (!navigationRef) {
    if (__DEV__) {
      console.error(
        'Navigation reference is not set. Make sure to call setNavigationRef.',
      );
    }
    return false;
  }

  navigationRef.dispatch(CommonActions.goBack());
  action?.();
  return true;
};
