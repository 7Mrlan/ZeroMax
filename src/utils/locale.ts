import {getLocales} from 'react-native-localize';
import i18n from 'i18next';
import StorageService from './asyncStorageService';

const LOCALE_OVERRIDE_KEY = 'user_locale_override';

interface DeviceLocaleInfo {
  languageTag: string;
  languageCode: string;
  countryCode: string;
  isRTL: boolean;
}

let cachedLocaleInfo: DeviceLocaleInfo | null = null;

/**
 * Returns the device's primary locale info from OS settings.
 * Cached per session — call invalidateLocaleCache() on AppState "active" if needed.
 */
export const getDeviceLocaleInfo = (): DeviceLocaleInfo => {
  if (cachedLocaleInfo) return cachedLocaleInfo;

  try {
    const locales = getLocales();
    if (locales.length > 0) {
      cachedLocaleInfo = {
        languageTag: locales[0].languageTag,
        languageCode: locales[0].languageCode,
        countryCode: locales[0].countryCode ?? '',
        isRTL: locales[0].isRTL,
      };
      return cachedLocaleInfo;
    }
  } catch {
    // Native module failed — use safe fallback
  }

  cachedLocaleInfo = {
    languageTag: 'en-US',
    languageCode: 'en',
    countryCode: 'US',
    isRTL: false,
  };
  return cachedLocaleInfo;
};

export const invalidateLocaleCache = (): void => {
  cachedLocaleInfo = null;
};

/**
 * Returns the locale to use for number/currency formatting.
 * Priority: user override (Settings) > device OS locale
 *
 * BCP-47 language tag (e.g., "en-US", "ru-RU", "hu-HU", "hi-IN")
 */
export const getFormatLocale = (): string => {
  const override = StorageService.getItemSync(LOCALE_OVERRIDE_KEY);
  if (override) return override;
  return getDeviceLocaleInfo().languageTag;
};

/**
 * Sets a locale override persisted in MMKV. Syncs i18next language and dayjs locale.
 * Pass null to reset to device default.
 */
export const setLocaleOverride = (locale: string | null): void => {
  if (locale) {
    StorageService.setItemSync(LOCALE_OVERRIDE_KEY, locale);
  } else {
    StorageService.removeItemSync(LOCALE_OVERRIDE_KEY);
  }
  cachedLocaleInfo = null;

  const langCode = locale ? locale.split('-')[0] : getDeviceLocaleInfo().languageCode;
  if (i18n.isInitialized) {
    void i18n.changeLanguage(langCode);
  }
  // Dates must follow the language too. Imported lazily: dateUtils imports
  // this module, so a top-level import would be circular.
  const {setDayjsLocale} = require('./dateUtils') as typeof import('./dateUtils');
  setDayjsLocale(langCode);
};

