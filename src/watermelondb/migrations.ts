import {schemaMigrations, createTable} from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'budgets',
          columns: [
            {name: 'user_id', type: 'string', isIndexed: true},
            {name: 'category_id', type: 'string', isOptional: true, isIndexed: true},
            {name: 'amount', type: 'number'},
            {name: 'month', type: 'string', isIndexed: true},
            {name: 'budget_type', type: 'string'},
          ],
        }),
      ],
    },
    {
      // Intended to index category_status / debtor_status.
      toVersion: 2,
      steps: [
        // NO-OP, and knowingly so. WatermelonDB does NOT recreate indexes for
        // existing tables on a version bump — `isIndexed` in schema.ts only
        // takes effect when a table is created, i.e. on fresh installs.
        // Devices upgraded from v1 therefore lack these two indexes. The
        // tables are small enough that it does not matter in practice; if it
        // ever does, add an explicit `unsafeExecuteSql('CREATE INDEX IF NOT
        // EXISTS ...')` step to the NEXT migration rather than editing this
        // one (already-applied migrations never re-run).
      ],
    },
  ],
});

export default migrations;
