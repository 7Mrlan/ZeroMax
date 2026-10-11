import {Query} from '@nozbe/watermelondb';
import {children} from '@nozbe/watermelondb/decorators';
import User from '../models/User';
import type Income from '../models/Income';

/** v4 target variant; production v3 continues using models/User. */
export default class TargetUser extends User {
  static associations = {
    ...User.associations,
    incomes: {type: 'has_many' as const, foreignKey: 'user_id'},
  };

  @children('incomes') incomes!: Query<Income>;
}
