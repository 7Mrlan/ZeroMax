/**
 * Regression test: soft-deleted categories must still resolve on historical expenses.
 *
 * The buildCategoryMap helper in expenseService.ts intentionally queries ALL
 * categories (no category_status filter) so that expenses under soft-deleted
 * categories keep their name/icon/color. This test verifies the source code
 * hasn't been "optimized" to filter by status.
 */

 
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

describe('expenseService — soft-delete category regression', () => {
  const serviceSource: string = fs.readFileSync(
    path.resolve(__dirname, '../expenseService.ts'),
    'utf-8',
  );

  it('buildCategoryMap must NOT filter by category_status', () => {
    const fnMatch = serviceSource.match(
      /const buildCategoryMap[\s\S]*?return new Map/,
    );
    expect(fnMatch).not.toBeNull();

    const fnBody = fnMatch![0];

    // The explanatory comment legitimately mentions category_status, so only
    // an actual query clause counts as a violation.
    expect(fnBody).not.toMatch(/Q\.where\(\s*['"]category_status/);
    expect(fnBody).toContain(
      'Intentionally queries ALL categories (no category_status filter)',
    );
  });

  it('mapExpenseWithCategory passes through even when category is missing from map', () => {
    const fnMatch = serviceSource.match(
      /const mapExpenseWithCategory[\s\S]*?\n\}\);/,
    );
    expect(fnMatch).not.toBeNull();

    const fnBody = fnMatch![0];
    expect(fnBody).toContain('categoryMap.get(e.categoryId)');
    expect(fnBody).not.toContain('throw');
  });
});
