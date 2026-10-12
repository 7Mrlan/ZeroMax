import {formatCategoryLabel} from '../categoryLabel';

describe('formatCategoryLabel', () => {
  it('includes the parent path for nested categories', () => {
    expect(formatCategoryLabel('Salary', 'Work')).toBe('Work · Salary');
  });

  it('keeps root categories unchanged', () => {
    expect(formatCategoryLabel('Food', null)).toBe('Food');
    expect(formatCategoryLabel('Food')).toBe('Food');
  });
});
