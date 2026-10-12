import {requestAiCompletion, type AiFetchResponse} from '../network';
import type {AiSecretStore} from '../settings';

const secretStore = (value: string | null): AiSecretStore => ({get: () => value, set: jest.fn(), clear: jest.fn()});
const settings = {enabled: true, apiBaseUrl: 'https://api.example.com/v1', modelName: 'test'};

describe('AI network boundary', () => {
  it('sends only the secure secret and parses the response', async () => {
    const fetchImpl = jest.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      headers: {get: () => null},
      text: async () =>
        '{"items":[{"type":"expense","title":"Lunch","amount":10,"categoryName":"Food","categoryHint":"","date":"2026-01-01","description":""}]}',
      init,
    }));
    await expect(
      requestAiCompletion(settings, secretStore('secret'), 'prompt', ['api.example.com'], fetchImpl),
    ).resolves.toHaveProperty('items');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({authorization: 'Bearer secret'}),
    });
  });

  it('unwraps an OpenAI-compatible choices message before Zod parsing', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: {get: () => null},
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"items":[{"type":"income","title":"Salary","amount":"1000","categoryName":"Salary","categoryHint":"","date":"2026-01-01","description":""}]}',
              },
            },
          ],
        }),
    }));
    await expect(
      requestAiCompletion(settings, secretStore('secret'), 'prompt', ['api.example.com'], fetchImpl),
    ).resolves.toMatchObject({items: [{type: 'income', amount: 1000}]});
  });

  it('blocks disabled AI and unavailable secrets before fetch', async () => {
    const fetchImpl = jest.fn();
    await expect(
      requestAiCompletion(
        {...settings, enabled: false},
        secretStore('secret'),
        'prompt',
        ['api.example.com'],
        fetchImpl,
      ),
    ).rejects.toThrow('disabled');
    await expect(
      requestAiCompletion(settings, secretStore(null), 'prompt', ['api.example.com'], fetchImpl),
    ).rejects.toThrow('secure storage');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries one transient HTTP failure and then succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ok: false, status: 503, headers: {get: () => null}, text: async () => ''})
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {get: () => null},
        text: async () => '{"items":[]}',
      }) as unknown as typeof fetch;
    await expect(
      requestAiCompletion(settings, secretStore('secret'), 'prompt', ['api.example.com'], fetchImpl),
    ).resolves.toEqual({items: []});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient HTTP failures', async () => {
    const fetchImpl = jest.fn(async () => ({ok: false, status: 401, headers: {get: () => null}, text: async () => ''}));
    await expect(
      requestAiCompletion(settings, secretStore('secret'), 'prompt', ['api.example.com'], fetchImpl),
    ).rejects.toThrow('401');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight request when the caller signal is cancelled', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit): Promise<AiFetchResponse> =>
        new Promise((_resolve, reject) => {
          const rejectAborted = () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
          if (init.signal?.aborted) {
            rejectAborted();
          } else {
            init.signal?.addEventListener('abort', rejectAborted, {once: true});
          }
        }),
    );
    const request = requestAiCompletion(
      settings,
      secretStore('secret'),
      'prompt',
      ['api.example.com'],
      fetchImpl,
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    await expect(request).rejects.toThrow('aborted');
  });
});
