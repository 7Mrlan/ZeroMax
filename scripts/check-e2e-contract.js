'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const flowDirectory = path.join(root, '.maestro');
const sourceDirectories = [path.join(root, 'src'), path.join(root, 'App.tsx')];
const flowFiles = fs
  .readdirSync(flowDirectory)
  .filter(file => file.endsWith('.yaml'))
  .sort();
const dynamicIdPrefixes = ['zero-tab-', 'onboarding-category-', 'category-row-', 'ai-cancel-', 'currency-option-'];

if (flowFiles.length === 0) throw new Error('No Maestro flows found');

const sourceText = sourceDirectories
  .flatMap(directory => {
    if (fs.statSync(directory).isFile()) return [fs.readFileSync(directory, 'utf8')];
    const files = [];
    const visit = current => {
      for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
        const next = path.join(current, entry.name);
        if (entry.isDirectory()) visit(next);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(fs.readFileSync(next, 'utf8'));
      }
    };
    visit(directory);
    return files;
  })
  .join('\n');

const currencies = JSON.parse(fs.readFileSync(path.join(root, 'assets/jsons/currencies.json'), 'utf8'));
const defaultCategories = JSON.parse(fs.readFileSync(path.join(root, 'assets/jsons/defaultCategories.json'), 'utf8'));
const tabRoutes = [...sourceText.matchAll(/^\s+([A-Za-z0-9]+Screen): undefined;$/gm)].map(match => match[1]);
const currencyCodes = new Set(currencies.map(currency => currency.code));
const categoryIds = new Set(defaultCategories.map(category => category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')));
const tabRouteIds = new Set(tabRoutes);

const missing = [];
for (const file of flowFiles) {
  const content = fs.readFileSync(path.join(flowDirectory, file), 'utf8');
  if (!content.includes('appId: com.anotherwhy.zero')) {
    throw new Error(`${file} must target appId com.anotherwhy.zero`);
  }
  for (const id of content.matchAll(/^\s+id:\s*([^\s#]+)\s*$/gm)) {
    const value = id[1];
    const dynamicPrefix = dynamicIdPrefixes.find(prefix => value.startsWith(prefix));
    if (dynamicPrefix === 'currency-option-' && !currencyCodes.has(value.slice(dynamicPrefix.length))) {
      missing.push(`${file}:${value} (currency fixture)`);
    } else if (dynamicPrefix === 'onboarding-category-' && !categoryIds.has(value.slice(dynamicPrefix.length))) {
      missing.push(`${file}:${value} (default category fixture)`);
    } else if (dynamicPrefix === 'zero-tab-' && !tabRouteIds.has(value.slice(dynamicPrefix.length))) {
      missing.push(`${file}:${value} (TabParamList route)`);
    } else if (!dynamicPrefix && !sourceText.includes(`"${value}"`)) {
      missing.push(`${file}:${value}`);
    }
  }
}

if (missing.length > 0) {
  throw new Error(`Maestro IDs are not present in source: ${missing.join(', ')}`);
}

console.log(`E2E contract validated: ${flowFiles.length} Maestro flows and stable source IDs`);
