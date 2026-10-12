import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import {getFormatLocale} from '../utils/locale';
import en from './locales/en.json';
import zh from './locales/zh.json';

const resources = {
  en: {translation: en},
  zh: {translation: zh},
} as const;

const initialLanguage = getFormatLocale().split('-')[0].toLowerCase();
const language = initialLanguage === 'zh' || initialLanguage === 'en' ? initialLanguage : 'en';

i18n.use(initReactI18next).init({
  resources,
  // Honour a persisted user override; initialising from the device locale
  // alone silently reverted the user's language choice on every cold start.
  lng: language,
  fallbackLng: 'en',
  interpolation: {escapeValue: false},
  react: {useSuspense: false},
});

export default i18n;
