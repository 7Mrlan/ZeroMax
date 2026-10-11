import {Q} from '@nozbe/watermelondb';
import {nanoid} from 'nanoid';
import {database} from '../database';
import Category from '../models/Category';
import {sanitizeString, DEFAULTS} from '../../backend/sanitize';

// Type for category data - all properties initialized for Hidden Class optimization
export interface CategoryData {
  id: string;
  name: string;
  categoryStatus: boolean;
  userId: string;
  icon: string;
  color: string;
  parentId: string;
  parentName: string | null;
  kind: 'expense' | 'income';
}

/**
 * Creates a new category
 */
export const createCategory = async (
  name: string,
  userId: string,
  icon: string | null,
  color: string | null,
  kind: 'expense' | 'income' = 'expense',
  parentId: string | null = null,
): Promise<string> => {
  const id = nanoid(24);
  await database.write(async () => {
    await database.get<Category>('categories').create(cat => {
      cat._raw.id = id;
      cat.name = name;
      cat.categoryStatus = true;
      cat.userId = userId;
      // Always assign string values for consistent Hidden Class shape
      cat.icon = sanitizeString(icon, DEFAULTS.icon);
      cat.color = sanitizeString(color, DEFAULTS.color);
      cat.kind = kind;
      cat.parentId = parentId ?? undefined;
    });
  });
  return id;
};

/**
 * Soft deletes a category by ID (sets categoryStatus to false)
 */
export const softDeleteCategoryById = async (categoryId: string): Promise<void> => {
  await database.write(async () => {
    const category = await database.get<Category>('categories').find(categoryId);
    const children = category.parentId
      ? []
      : await database.get<Category>('categories').query(Q.where('parent_id', categoryId)).fetch();
    await database.batch(
      category.prepareUpdate(cat => {
        cat.categoryStatus = false;
      }),
      ...children.map(child =>
        child.prepareUpdate(childRecord => {
          childRecord.categoryStatus = false;
        }),
      ),
    );
  });
};

/**
 * Updates a category by ID
 */
export const updateCategoryById = async (
  categoryId: string,
  newName?: string,
  newIcon?: string,
  newColor?: string,
  newKind?: 'expense' | 'income',
  newParentId?: string | null,
): Promise<void> => {
  await database.write(async () => {
    const category = await database.get<Category>('categories').find(categoryId);
    const resolvedParentId = newParentId !== undefined ? newParentId : (category.parentId ?? null);
    const parentColor = resolvedParentId
      ? (await database.get<Category>('categories').find(resolvedParentId)).color
      : null;
    await category.update(cat => {
      if (newName !== undefined) {
        cat.name = newName;
      }
      if (newIcon !== undefined) {
        cat.icon = sanitizeString(newIcon, DEFAULTS.icon);
      }
      if (parentColor) {
        cat.color = parentColor;
      } else if (newColor !== undefined) {
        cat.color = sanitizeString(newColor, DEFAULTS.color);
      }
      if (newKind !== undefined) cat.kind = newKind;
      if (newParentId !== undefined) cat.parentId = newParentId ?? undefined;
    });
    if (!resolvedParentId && newColor !== undefined) {
      const children = await database.get<Category>('categories').query(Q.where('parent_id', categoryId)).fetch();
      await database.batch(
        ...children.map(child =>
          child.prepareUpdate(childRecord => {
            childRecord.color = sanitizeString(newColor, DEFAULTS.color);
          }),
        ),
      );
    }
  });
};

/**
 * Gets all categories by user ID
 */
export const getAllCategoriesByUserId = async (userId: string): Promise<CategoryData[]> => {
  const categories = await database.get<Category>('categories').query(Q.where('user_id', userId)).fetch();
  const namesById = new Map(categories.map(category => [category.id, category.name]));
  return categories.map(c => ({
    id: c.id,
    name: c.name,
    categoryStatus: c.categoryStatus,
    userId: c.userId,
    icon: sanitizeString(c.icon, DEFAULTS.icon),
    color: sanitizeString(c.color, DEFAULTS.color),
    parentId: c.parentId ?? '',
    parentName: c.parentId ? (namesById.get(c.parentId) ?? null) : null,
    kind: c.kind === 'income' ? 'income' : 'expense',
  }));
};
