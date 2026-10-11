import {normalizeAiEndpoint, parseAiResponse, type AiParserResponse} from './parser';
import type {AiSecretStore, AiSettings} from './settings';

export interface AiFetchResponse {
  ok: boolean;
  status: number;
  headers?: {get: (name: string) => string | null};
  text: () => Promise<string>;
}

export type AiFetch = (input: string, init: RequestInit) => Promise<AiFetchResponse>;

const MAX_RESPONSE_BYTES = 256 * 1024;
const TIMEOUT_MS = 15_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const requestAiCompletion = async (
  settings: AiSettings,
  secretStore: AiSecretStore,
  prompt: string,
  allowedHosts: readonly string[],
  fetchImpl: AiFetch = fetch as unknown as AiFetch,
): Promise<AiParserResponse> => {
  if (!settings.enabled) throw new Error('AI network access is disabled');
  const apiKey = secretStore.get()?.trim();
  if (!apiKey) throw new Error('AI API key is unavailable in secure storage');
  const endpoint = normalizeAiEndpoint(settings.apiBaseUrl, allowedHosts);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
        body: JSON.stringify({model: settings.modelName, messages: [{role: 'user', content: prompt}], temperature: 0}),
        signal: controller.signal,
      });
      const contentLength = Number(response.headers?.get('content-length') ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) throw new Error('AI response exceeds the size limit');
      const body = await response.text();
      if (!response.ok) {
        if (attempt === 0 && RETRYABLE_STATUS.has(response.status)) {
          await wait(250);
          continue;
        }
        throw new Error(`AI request failed with status ${response.status}`);
      }
      return parseAiResponse(body);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isHttpFailure = lastError.message.startsWith('AI request failed with status');
      if (isHttpFailure) throw lastError;
      if (attempt === 0 && lastError.name !== 'AbortError' && !isHttpFailure) {
        await wait(250);
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error('AI request failed');
};
