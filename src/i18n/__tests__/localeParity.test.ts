import en from '../locales/en.json';
import zh from '../locales/zh.json';

const leafPaths = (value: unknown, prefix = ''): string[] => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
};

const leafValues = (value: unknown, prefix = ''): Record<string, string> => {
  if (typeof value === 'string') return {[prefix]: value};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>(
    (result, [key, child]) => ({...result, ...leafValues(child, prefix ? `${prefix}.${key}` : key)}),
    {},
  );
};

describe('locale resources', () => {
  it('keep Chinese and English leaf keys in parity', () => {
    expect(leafPaths(zh).sort()).toEqual(leafPaths(en).sort());
  });

  it('does not silently reuse English user-facing copy in Chinese resources', () => {
    const english = leafValues(en);
    const chinese = leafValues(zh);
    const identical = Object.keys(english).filter(path => chinese[path] === english[path]);
    expect(identical).toEqual([]);
  });
});
