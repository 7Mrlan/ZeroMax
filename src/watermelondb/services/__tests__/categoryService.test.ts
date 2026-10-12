jest.mock('../../database', () => ({
  database: {
    get: jest.fn(),
    write: jest.fn(),
    batch: jest.fn(),
  },
}));

import {database} from '../../database';
import {restoreCategoryById} from '../categoryService';

const makeCategory = (id: string, userId: string, parentId?: string) => {
  const updated: Record<string, unknown> = {};
  const record = {
    id,
    userId,
    parentId,
    prepareUpdate: jest.fn((mutate: (value: Record<string, unknown>) => void) => {
      mutate(updated);
      return {updated};
    }),
  };
  return {record, updated};
};

describe('categoryService restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (database.write as jest.Mock).mockImplementation(async (work: () => Promise<void>) => work());
    (database.batch as jest.Mock).mockResolvedValue(undefined);
  });

  it('restores a root and all of its direct descendants in one batch', async () => {
    const root = makeCategory('root', 'u1');
    const child = makeCategory('child', 'u1', 'root');
    const grandchild = makeCategory('grandchild', 'u1', 'child');
    (database.get as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue(root.record),
      query: jest.fn().mockReturnValue({fetch: jest.fn().mockResolvedValue([child.record, grandchild.record])}),
    });

    await restoreCategoryById('root', 'u1');

    expect(root.updated).toEqual({categoryStatus: true});
    expect(child.updated).toEqual({categoryStatus: true});
    expect(grandchild.updated).toEqual({categoryStatus: true});
    expect(database.batch).toHaveBeenCalledWith(
      {updated: root.updated},
      {updated: child.updated},
      {updated: grandchild.updated},
    );
  });

  it('fails closed when the category belongs to another user', async () => {
    const foreign = makeCategory('foreign', 'u2');
    (database.get as jest.Mock).mockReturnValue({find: jest.fn().mockResolvedValue(foreign.record)});

    await expect(restoreCategoryById('foreign', 'u1')).rejects.toThrow('active user');
    expect(database.batch).not.toHaveBeenCalled();
  });
});
