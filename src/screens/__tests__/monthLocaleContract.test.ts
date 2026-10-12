/**
 * The month list is locale-backed mutable data. Keeping it in a module-level
 * constant makes Home/Reports stale after an in-place language switch, so
 * these screens must derive it from i18n.language inside the hook.
 */
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

const screens = ['../HomeScreen/useHome.ts', '../ReportsScreen/useReports.ts'];

describe('screen month locale contract', () => {
  it.each(screens)('%s refreshes month names when language changes', screenPath => {
    const source = fs.readFileSync(path.resolve(__dirname, screenPath), 'utf8');

    expect(source).not.toContain('const MONTHS = getMonthNames();');
    expect(source).toContain('useTranslation();');
    expect(source).toContain('const months = getMonthNames();');
  });
});
