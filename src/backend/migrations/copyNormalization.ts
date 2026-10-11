import type {LegacyDatabaseSource} from './legacySchema';
import {COPY_TABLES, type CopyDataset, type CopyRow} from './copyVerification';

export interface CopyNormalizationResult {
  dataset: CopyDataset;
  transforms: string[];
}

const cloneRows = (rows: ReadonlyArray<CopyRow> | undefined): CopyRow[] => (rows ?? []).map(row => ({...row}));

const withAllTables = (dataset: CopyDataset): CopyDataset => {
  const complete: CopyDataset = {};
  for (const table of COPY_TABLES) {
    complete[table] = cloneRows(dataset[table]);
  }
  return complete;
};

const assertCategoryKind = (row: CopyRow): 'expense' | 'income' => {
  if (row.kind === 'expense' || row.kind === 'income') {
    return row.kind;
  }
  throw new Error(`Zerox category ${row.id} has no valid kind; refusing implicit remapping`);
};

/**
 * Produces the complete v4 row set expected by the copy verifier. It never
 * changes IDs or transaction category references and records every default it
 * adds so a migration report can explain the transformation.
 */
export const normalizeLegacyRows = (
  source: Extract<LegacyDatabaseSource, 'zero-v3' | 'zerox-v3'>,
  input: CopyDataset,
): CopyNormalizationResult => {
  const dataset = withAllTables(input);
  const transforms: string[] = [];

  if (source === 'zero-v3') {
    dataset.incomes = [];
    transforms.push('created empty incomes table');
    dataset.categories = dataset.categories!.map(row => ({...row, parent_id: null, kind: 'expense'}));
    transforms.push('defaulted Zero categories to kind=expense and parent_id=null');
    return {dataset, transforms};
  }

  dataset.budgets = [];
  transforms.push('created empty budgets table');
  dataset.categories = dataset.categories!.map(row => ({...row, kind: assertCategoryKind(row)}));
  dataset.expenses = dataset.expenses!.map(row =>
    Object.prototype.hasOwnProperty.call(row, 'description') ? row : {...row, description: null},
  );
  transforms.push('defaulted missing Zerox expense descriptions to null');
  return {dataset, transforms};
};
