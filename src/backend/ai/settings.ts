import StorageService from '../../utils/asyncStorageService';
import {NativeModules} from 'react-native';

export interface AiSecretStore {
  get: () => string | null | Promise<string | null>;
  set: (value: string) => void | Promise<void>;
  clear: () => void | Promise<void>;
}

export interface AiSettings {
  enabled: boolean;
  apiBaseUrl: string;
  modelName: string;
}

const ENABLED_KEY = 'ai.enabled';
const BASE_URL_KEY = 'ai.apiBaseUrl';
const MODEL_KEY = 'ai.modelName';

export const EMPTY_AI_SETTINGS: AiSettings = {enabled: false, apiBaseUrl: '', modelName: ''};

export const getAiSettings = (): AiSettings => ({
  enabled: StorageService.getBoolean(ENABLED_KEY),
  apiBaseUrl: StorageService.getItemSync(BASE_URL_KEY) ?? '',
  modelName: StorageService.getItemSync(MODEL_KEY) ?? '',
});

export const saveAiSettings = (settings: AiSettings): void => {
  StorageService.setBoolean(ENABLED_KEY, settings.enabled);
  StorageService.setItemSync(BASE_URL_KEY, settings.apiBaseUrl.trim());
  StorageService.setItemSync(MODEL_KEY, settings.modelName.trim());
};

export const clearAiSettings = (): void => {
  StorageService.setBoolean(ENABLED_KEY, false);
  StorageService.removeItemSync(BASE_URL_KEY);
  StorageService.removeItemSync(MODEL_KEY);
};

export const getMissingAiSettingsFields = (settings: AiSettings, secret: string | null): string[] => {
  const missing: string[] = [];
  if (!settings.apiBaseUrl.trim()) missing.push('API Base URL');
  if (!settings.modelName.trim()) missing.push('Model Name');
  if (!secret?.trim()) missing.push('API Key');
  return missing;
};

export const saveAiSecret = async (secretStore: AiSecretStore, secret: string): Promise<void> => {
  const trimmed = secret.trim();
  if (!trimmed) throw new Error('API key cannot be empty');
  await secretStore.set(trimmed);
};

export const createNativeAiSecretStore = (): AiSecretStore => {
  const native = (
    NativeModules as {
      ZeroSecureSecrets?: {
        getSecret: (name: string) => Promise<string | null>;
        setSecret: (name: string, value: string) => Promise<void>;
        clearSecret: (name: string) => Promise<void>;
      };
    }
  ).ZeroSecureSecrets;
  if (!native) throw new Error('Secure secret native module is unavailable');
  return {
    get: () => native.getSecret('ai_api_key'),
    set: value => native.setSecret('ai_api_key', value),
    clear: () => native.clearSecret('ai_api_key'),
  };
};
