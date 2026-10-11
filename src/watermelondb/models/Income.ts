import {Model, Relation} from '@nozbe/watermelondb';
import {field, text, immutableRelation} from '@nozbe/watermelondb/decorators';
import type Category from './Category';
import type User from './User';

/** v4-only model; it is not registered in the production v3 database. */
export default class Income extends Model {
  static table = 'incomes';

  static associations = {
    categories: {type: 'belongs_to' as const, key: 'category_id'},
    users: {type: 'belongs_to' as const, key: 'user_id'},
  };

  @text('title') title!: string;
  @field('amount') amount!: number;
  @text('category_id') categoryId!: string;
  @text('user_id') userId!: string;
  @text('date') date!: string;

  @immutableRelation('categories', 'category_id') category!: Relation<Category>;
  @immutableRelation('users', 'user_id') user!: Relation<User>;
}
