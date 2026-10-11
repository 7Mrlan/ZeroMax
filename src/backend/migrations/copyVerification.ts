export const COPY_TABLES = [
  'users',
  'categories',
  'expenses',
  'incomes',
  'currencies',
  'debtors',
  'debts',
  'budgets',
] as const;

export type CopyTable = (typeof COPY_TABLES)[number];

export type CopyRow = Readonly<Record<string, unknown>> & {id: string};
export type CopyDataset = Partial<Record<CopyTable, ReadonlyArray<CopyRow>>>;

export interface CopyVerificationInput {
  source: CopyDataset;
  /** Expected normalized v4 rows produced by the source-specific copy planner. */
  expectedTarget: CopyDataset;
  /** Rows read back from the actual v4 database after the write transaction. */
  actualTarget: CopyDataset;
}

export interface CopyVerificationReport {
  ok: boolean;
  tablesPresent: boolean;
  rowCountsMatch: boolean;
  amountSumsMatch: boolean;
  idsMatch: boolean;
  relationsMatch: boolean;
  existingValuesMatch: boolean;
  statusAndChangedMatch: boolean;
  errors: string[];
}

const RELATIONS: ReadonlyArray<readonly [CopyTable, string, CopyTable, boolean]> = [
  ['categories', 'user_id', 'users', false],
  ['categories', 'parent_id', 'categories', true],
  ['expenses', 'category_id', 'categories', false],
  ['expenses', 'user_id', 'users', false],
  ['incomes', 'category_id', 'categories', false],
  ['incomes', 'user_id', 'users', false],
  ['currencies', 'user_id', 'users', false],
  ['debtors', 'user_id', 'users', false],
  ['debts', 'debtor_id', 'debtors', false],
  ['debts', 'user_id', 'users', false],
  ['budgets', 'category_id', 'categories', true],
  ['budgets', 'user_id', 'users', false],
];

const rowsFor = (dataset: CopyDataset, table: CopyTable): ReadonlyArray<CopyRow> => dataset[table] ?? [];

const idSet = (rows: ReadonlyArray<CopyRow>): Set<string> => new Set(rows.map(row => row.id));

const hasDuplicateIds = (rows: ReadonlyArray<CopyRow>): boolean => idSet(rows).size !== rows.length;

const hasInvalidIds = (rows: ReadonlyArray<CopyRow>): boolean =>
  rows.some(row => typeof row.id !== 'string' || row.id.length === 0);

const amountSum = (rows: ReadonlyArray<CopyRow>): number | null => {
  let total = 0;
  for (const row of rows) {
    if (typeof row.amount !== 'number' || !Number.isFinite(row.amount)) {
      return null;
    }
    total += row.amount;
  }
  return total;
};

const amountsMatch = (left: ReadonlyArray<CopyRow>, right: ReadonlyArray<CopyRow>): boolean => {
  const leftTotal = amountSum(left);
  const rightTotal = amountSum(right);
  return (
    leftTotal !== null &&
    rightTotal !== null &&
    Math.abs(leftTotal - rightTotal) <= Number.EPSILON * Math.max(1, Math.abs(leftTotal), Math.abs(rightTotal)) * 8
  );
};

const valuesMatch = (left: unknown, right: unknown): boolean => Object.is(left, right);

const VALID_STATUSES = new Set(['created', 'updated', 'deleted', 'synced']);

const metadataIsValid = (row: CopyRow): boolean =>
  typeof row._status === 'string' && VALID_STATUSES.has(row._status) && typeof row._changed === 'string';

const metadataMatches = (expected: ReadonlyArray<CopyRow>, actual: ReadonlyArray<CopyRow>): boolean => {
  const actualById = new Map(actual.map(row => [row.id, row]));
  return expected.every(row => {
    const copied = actualById.get(row.id);
    return (
      metadataIsValid(row) &&
      !!copied &&
      metadataIsValid(copied) &&
      valuesMatch(row._status, copied._status) &&
      valuesMatch(row._changed, copied._changed)
    );
  });
};

const compareIds = (expected: ReadonlyArray<CopyRow>, actual: ReadonlyArray<CopyRow>): boolean => {
  const expectedIds = [...idSet(expected)].sort();
  const actualIds = [...idSet(actual)].sort();
  return expectedIds.length === actualIds.length && expectedIds.every((id, index) => id === actualIds[index]);
};

const fieldsMatch = (expected: ReadonlyArray<CopyRow>, actual: ReadonlyArray<CopyRow>): boolean => {
  const actualById = new Map(actual.map(row => [row.id, row]));
  return expected.every(expectedRow => {
    const actualRow = actualById.get(expectedRow.id);
    if (!actualRow) {
      return false;
    }
    const expectedKeys = Object.keys(expectedRow).sort();
    const actualKeys = Object.keys(actualRow).sort();
    return (
      expectedKeys.length === actualKeys.length &&
      expectedKeys.every(key => actualKeys.includes(key) && valuesMatch(expectedRow[key], actualRow[key]))
    );
  });
};

const sourceFieldsPreserved = (source: ReadonlyArray<CopyRow>, expected: ReadonlyArray<CopyRow>): boolean => {
  const expectedById = new Map(expected.map(row => [row.id, row]));
  return source.every(sourceRow => {
    const expectedRow = expectedById.get(sourceRow.id);
    if (!expectedRow) {
      return false;
    }
    return Object.entries(sourceRow).every(([key, value]) => valuesMatch(value, expectedRow[key]));
  });
};

const relationsMatch = (dataset: CopyDataset): string[] => {
  const errors: string[] = [];
  for (const [table, column, parentTable, optional] of RELATIONS) {
    const parentIds = idSet(rowsFor(dataset, parentTable));
    for (const row of rowsFor(dataset, table)) {
      const value = row[column];
      if ((value === null || value === undefined || value === '') && optional) {
        continue;
      }
      if (typeof value !== 'string' || !parentIds.has(value)) {
        errors.push(`${table}.${column} references missing ${parentTable}: ${String(value)}`);
      }
    }
  }
  return errors;
};

const domainErrors = (dataset: CopyDataset, requireCategoryKind: boolean): string[] => {
  const errors: string[] = [];
  const categories = rowsFor(dataset, 'categories');
  const categoriesById = new Map(categories.map(row => [row.id, row]));
  for (const row of categories) {
    if (row.kind !== undefined && row.kind !== null && row.kind !== 'expense' && row.kind !== 'income') {
      errors.push(`categories.kind has unsupported value: ${String(row.kind)}`);
    }
    if (requireCategoryKind && row.kind !== 'expense' && row.kind !== 'income') {
      errors.push(`categories.kind is missing for target category: ${row.id}`);
    }
    const parentId = row.parent_id;
    if (parentId === row.id) {
      errors.push(`categories.parent_id self-reference: ${row.id}`);
    }
    if (typeof parentId === 'string' && parentId.length > 0) {
      const parent = categoriesById.get(parentId);
      if (parent && row.user_id !== parent.user_id) {
        errors.push(`categories.parent_id crosses users: ${row.id}`);
      }
      if (parent && row.kind !== undefined && parent.kind !== undefined && row.kind !== parent.kind) {
        errors.push(`categories.parent_id changes kind: ${row.id}`);
      }
      const seen = new Set<string>([row.id]);
      let cursor = parent;
      while (cursor && typeof cursor.parent_id === 'string' && cursor.parent_id.length > 0) {
        if (seen.has(cursor.id)) {
          errors.push(`categories.parent_id cycle: ${row.id}`);
          break;
        }
        seen.add(cursor.id);
        cursor = categoriesById.get(cursor.parent_id);
      }
    }
  }
  return errors;
};

const missingTables = (dataset: CopyDataset): CopyTable[] =>
  COPY_TABLES.filter(table => !Object.prototype.hasOwnProperty.call(dataset, table));

/**
 * Compares normalized target rows with the actual read-back rows without
 * opening SQLite. Source fields must survive normalization; expected target
 * fields must survive the write exactly, including IDs and sync metadata.
 */
export const verifyCopiedRows = ({
  source,
  expectedTarget,
  actualTarget,
}: CopyVerificationInput): CopyVerificationReport => {
  const errors: string[] = [];
  const expectedMissingTables = missingTables(expectedTarget);
  const actualMissingTables = missingTables(actualTarget);
  const tablesPresent = expectedMissingTables.length === 0 && actualMissingTables.length === 0;
  if (expectedMissingTables.length > 0) {
    errors.push(`Expected target missing tables: ${expectedMissingTables.join(', ')}`);
  }
  if (actualMissingTables.length > 0) {
    errors.push(`Actual target missing tables: ${actualMissingTables.join(', ')}`);
  }

  let rowCountsMatch = true;
  let idsMatch = true;
  let statusAndChangedMatch = true;
  let amountSumsMatch = true;
  let existingValuesAreEqual = true;

  for (const table of COPY_TABLES) {
    const sourceRows = rowsFor(source, table);
    const expectedRows = rowsFor(expectedTarget, table);
    const actualRows = rowsFor(actualTarget, table);
    if (hasInvalidIds(sourceRows) || hasInvalidIds(expectedRows) || hasInvalidIds(actualRows)) {
      errors.push(`Invalid empty/non-string IDs in ${table}`);
      idsMatch = false;
    }
    if (hasDuplicateIds(sourceRows) || hasDuplicateIds(expectedRows) || hasDuplicateIds(actualRows)) {
      errors.push(`Duplicate IDs in ${table}`);
      idsMatch = false;
    }
    if (!compareIds(sourceRows, expectedRows)) {
      errors.push(`Source-to-target ID mismatch in ${table}`);
      idsMatch = false;
    }
    if (expectedRows.length !== actualRows.length) {
      errors.push(`Row count mismatch in ${table}`);
      rowCountsMatch = false;
    }
    if (!compareIds(expectedRows, actualRows)) {
      errors.push(`Target ID mismatch in ${table}`);
      idsMatch = false;
    }
    if (!sourceFieldsPreserved(sourceRows, expectedRows) || !fieldsMatch(expectedRows, actualRows)) {
      errors.push(`Existing field mismatch in ${table}`);
      existingValuesAreEqual = false;
    }
    if (!metadataMatches(expectedRows, actualRows)) {
      errors.push(`Watermelon metadata mismatch in ${table}`);
      statusAndChangedMatch = false;
    }
  }

  for (const table of ['expenses', 'incomes', 'debts', 'budgets'] as const) {
    const sourceRows = rowsFor(source, table);
    const expectedRows = rowsFor(expectedTarget, table);
    const actualRows = rowsFor(actualTarget, table);
    if (!amountsMatch(sourceRows, expectedRows) || !amountsMatch(expectedRows, actualRows)) {
      errors.push(`Amount sum mismatch in ${table}`);
      amountSumsMatch = false;
    }
  }

  const sourceRelationErrors = relationsMatch(source);
  const expectedRelationErrors = relationsMatch(expectedTarget);
  const actualRelationErrors = relationsMatch(actualTarget);
  if (sourceRelationErrors.length > 0) {
    errors.push(...sourceRelationErrors.map(error => `Source relation: ${error}`));
  }
  if (expectedRelationErrors.length > 0) {
    errors.push(...expectedRelationErrors.map(error => `Expected relation: ${error}`));
  }
  if (actualRelationErrors.length > 0) {
    errors.push(...actualRelationErrors.map(error => `Actual relation: ${error}`));
  }

  const sourceDomainErrors = domainErrors(source, false);
  const expectedDomainErrors = domainErrors(expectedTarget, true);
  const actualDomainErrors = domainErrors(actualTarget, true);
  errors.push(...sourceDomainErrors.map(error => `Source domain: ${error}`));
  errors.push(...expectedDomainErrors.map(error => `Expected domain: ${error}`));
  errors.push(...actualDomainErrors.map(error => `Actual domain: ${error}`));

  const relationsAreValid =
    sourceRelationErrors.length === 0 &&
    expectedRelationErrors.length === 0 &&
    actualRelationErrors.length === 0 &&
    sourceDomainErrors.length === 0 &&
    expectedDomainErrors.length === 0 &&
    actualDomainErrors.length === 0;
  return {
    ok:
      tablesPresent &&
      rowCountsMatch &&
      amountSumsMatch &&
      idsMatch &&
      relationsAreValid &&
      existingValuesAreEqual &&
      statusAndChangedMatch,
    tablesPresent,
    rowCountsMatch,
    amountSumsMatch,
    idsMatch,
    relationsMatch: relationsAreValid,
    existingValuesMatch: existingValuesAreEqual,
    statusAndChangedMatch,
    errors,
  };
};
