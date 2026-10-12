import {buildCategoryTotals} from '../categoryTotals';

const categories = [
  {id: 'root', parentId: ''},
  {id: 'child', parentId: 'root'},
  {id: 'grandchild', parentId: 'child'},
];

describe('buildCategoryTotals', () => {
  it('aggregates direct amounts into every ancestor exactly once', () => {
    const totals = buildCategoryTotals(categories, [
      {categoryId: 'root', amount: 5},
      {categoryId: 'child', amount: 7},
      {categoryId: 'grandchild', amount: 11},
    ]);

    expect(Object.fromEntries(totals)).toEqual({root: 23, child: 18, grandchild: 11});
  });

  it('stops on an imported parent cycle and ignores non-finite amounts', () => {
    const totals = buildCategoryTotals(
      [
        {id: 'a', parentId: 'b'},
        {id: 'b', parentId: 'a'},
      ],
      [
        {categoryId: 'a', amount: 3},
        {categoryId: 'b', amount: Number.NaN},
      ],
    );

    expect(Object.fromEntries(totals)).toEqual({a: 3, b: 3});
  });
});
