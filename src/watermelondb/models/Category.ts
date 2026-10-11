import {Model, Query, Relation} from '@nozbe/watermelondb';
import {field, text, children, immutableRelation} from '@nozbe/watermelondb/decorators';
import type Expense from './Expense';
import type User from './User';

export default class Category extends Model {
  static table = 'categories';

  static associations = {
    expenses: {type: 'has_many' as const, foreignKey: 'category_id'},
    users: {type: 'belongs_to' as const, key: 'user_id'},
  };

  @text('name') name!: string;
  @field('category_status') categoryStatus!: boolean;
  @text('user_id') userId!: string;
  @text('icon') icon?: string;
  @text('color') color!: string;
  /** Present in the unified v4 target; legacy v3 rows read as undefined. */
  @text('parent_id') parentId?: string;
  @text('kind') kind?: 'expense' | 'income';

  @children('expenses') expenses!: Query<Expense>;
  @immutableRelation('users', 'user_id') user!: Relation<User>;
}
