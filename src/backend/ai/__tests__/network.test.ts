import {requestAiCompletion} from '../network';
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
});
