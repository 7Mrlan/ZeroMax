import en from '../locales/en.json';
import zh from '../locales/zh.json';

const leafPaths = (value: unknown, prefix = ''): string[] => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
};

describe('locale resources', () => {
  it('keep Chinese and English leaf keys in parity', () => {
    expect(leafPaths(zh).sort()).toEqual(leafPaths(en).sort());
  });
});
