import {Query} from '@nozbe/watermelondb';
import {children, text} from '@nozbe/watermelondb/decorators';
import Category from '../models/Category';
import type Income from '../models/Income';

/** v4 target variant; production v3 continues using models/Category. */
export default class TargetCategory extends Category {
  static associations = {
    ...Category.associations,
    incomes: {type: 'has_many' as const, foreignKey: 'category_id'},
  };

  @text('parent_id') parentId?: string;
  @text('kind') kind?: string;

  @children('incomes') incomes!: Query<Income>;
}
