import {Model, type Relation} from '@nozbe/watermelondb';
import {text, field, immutableRelation} from '@nozbe/watermelondb/decorators';
import type User from './User';

export default class Budget extends Model {
  static table = 'budgets';

  static associations = {
    users: {type: 'belongs_to' as const, key: 'user_id'},
  };

  @text('user_id') userId!: string;
  /**
   * Reserved for per-category budgets, which are not implemented yet: the
   * column is optional in the schema and every writer stores ''. Typed as
   * string (not string | null) to match what is actually written.
   */
  @text('category_id') categoryId!: string;
  @field('amount') amount!: number;
  @text('month') month!: string;
  @text('budget_type') budgetType!: string;

  @immutableRelation('users', 'user_id') user!: Relation<User>;
}
