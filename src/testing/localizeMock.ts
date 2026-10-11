/**
 * Jest mock for `react-native-localize`, registered in jest.setup.js.
 *
 * Tests import the setters directly (same module instance as the mock) to
 * change the simulated device locale. Remember that src/utils/locale.ts
 * caches the first read — call its invalidateLocaleCache() after switching.
 */

export interface MockLocale {
  languageTag: string;
  languageCode: string;
  countryCode: string;
  isRTL: boolean;
}

const DEFAULT_LOCALES: MockLocale[] = [{languageTag: 'en-US', languageCode: 'en', countryCode: 'US', isRTL: false}];

let locales: MockLocale[] = DEFAULT_LOCALES;
let numberFormatSettings = {decimalSeparator: '.', groupingSeparator: ','};

export const getLocales = (): MockLocale[] => locales;

export const getNumberFormatSettings = () => numberFormatSettings;

export const setMockLocales = (next: MockLocale[]): void => {
  locales = next;
};

export const setMockNumberFormatSettings = (next: {decimalSeparator: string; groupingSeparator: string}): void => {
  numberFormatSettings = next;
};

export const resetLocalizeMock = (): void => {
  locales = DEFAULT_LOCALES;
  numberFormatSettings = {decimalSeparator: '.', groupingSeparator: ','};
};
