/**
 * Regression test: soft-deleted categories must still resolve on historical expenses.
 *
 * The buildCategoryMap helper in expenseService.ts intentionally queries ALL
 * categories (no category_status filter) so that expenses under soft-deleted
 * categories keep their name/icon/color. This test verifies the source code
 * hasn't been "optimized" to filter by status.
 */

jest.mock('../../database', () => ({
  database: {
    get: jest.fn(),
  },
}));

declare const __dirname: string;
const fs = require('fs');
const path = require('path');

import {database} from '../../database';
import {getAllExpensesByMonth} from '../expenseService';

describe('expenseService — soft-delete category regression', () => {
  const serviceSource: string = fs.readFileSync(path.resolve(__dirname, '../expenseService.ts'), 'utf-8');

  it('buildCategoryMap must NOT filter by category_status', () => {
    const fnMatch = serviceSource.match(/const buildCategoryMap[\s\S]*?return new Map/);
    expect(fnMatch).not.toBeNull();

    const fnBody = fnMatch![0];

    // The explanatory comment legitimately mentions category_status, so only
    // an actual query clause counts as a violation.
    expect(fnBody).not.toMatch(/Q\.where\(\s*['"]category_status/);
    expect(fnBody).toContain('Intentionally queries ALL categories (no category_status filter)');
  });

  it('mapExpenseWithCategory passes through even when category is missing from map', () => {
    const fnMatch = serviceSource.match(/const mapExpenseWithCategory[\s\S]*?\n\}\);/);
    expect(fnMatch).not.toBeNull();

    const fnBody = fnMatch![0];
    expect(fnBody).toContain('categoryMap.get(e.categoryId)');
    expect(fnBody).not.toContain('throw');
  });

  it('keeps parent labels for historical expenses under soft-deleted categories', async () => {
    const expense = {
      id: 'expense-1',
      title: 'Legacy lunch',
      amount: 10,
      description: '',
      categoryId: 'expense-child',
      userId: 'u1',
      date: '2026-10-12',
    };
    const categories = [
      {id: 'expense-root', name: 'Food', parentId: undefined, icon: 'utensils', color: '#111', categoryStatus: false},
      {
        id: 'expense-child',
        name: 'Lunch',
        parentId: 'expense-root',
        icon: 'sandwich',
        color: '#222',
        categoryStatus: true,
      },
    ];
    (database.get as jest.Mock).mockImplementation((table: string) => ({
      query: jest
        .fn()
        .mockReturnValue({fetch: jest.fn().mockResolvedValue(table === 'expenses' ? [expense] : categories)}),
    }));

    await expect(getAllExpensesByMonth('u1', '2026-10')).resolves.toEqual([
      expect.objectContaining({
        id: 'expense-1',
        category: expect.objectContaining({name: 'Lunch', parentName: 'Food'}),
      }),
    ]);
  });
});
