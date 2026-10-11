export type DefaultCategoryKey =
  | 'food'
  | 'transportation'
  | 'entertainment'
  | 'healthcare'
  | 'shopping'
  | 'travel'
  | 'utilities'
  | 'education'
  | 'gifts'
  | 'other';

const keys: Record<string, DefaultCategoryKey> = {
  Food: 'food',
  Transportation: 'transportation',
  Entertainment: 'entertainment',
  Healthcare: 'healthcare',
  Shopping: 'shopping',
  Travel: 'travel',
  Utilities: 'utilities',
  Education: 'education',
  Gifts: 'gifts',
  Other: 'other',
};

export const getDefaultCategoryKey = (name: string): DefaultCategoryKey | undefined => keys[name];
