import {COPY_TABLES, type CopyDataset, type CopyRow} from './copyVerification';

const compareStrings = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const encodeValue = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'string') {
    return `string:${JSON.stringify(value)}`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot fingerprint a non-finite number');
    }
    return `number:${value}`;
  }
  if (typeof value === 'boolean') {
    return `boolean:${value}`;
  }
  if (Array.isArray(value)) {
    return `array:[${value.map(encodeValue).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${encodeValue(entry)}`);
    return `object:{${entries.join(',')}}`;
  }
  throw new Error(`Cannot fingerprint unsupported value type: ${typeof value}`);
};

const encodeRow = (row: CopyRow): string => {
  const entries = Object.entries(row)
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([key, value]) => `${JSON.stringify(key)}:${encodeValue(value)}`);
  return `{${entries.join(',')}}`;
};

const rowsForFingerprint = (rows: ReadonlyArray<CopyRow>): string =>
  [...rows]
    .sort((left, right) => compareStrings(left.id, right.id))
    .map(encodeRow)
    .join(',');

/**
 * Returns a deterministic content fingerprint for migration consistency
 * checks. This is a change detector, not a cryptographic integrity hash.
 * Missing tables and present-but-empty tables intentionally encode differently.
 */
export const fingerprintCopyDataset = (dataset: CopyDataset): string => {
  const canonical = COPY_TABLES.map(table => {
    const hasTable = Object.prototype.hasOwnProperty.call(dataset, table);
    return `${table}:${hasTable ? `[${rowsForFingerprint(dataset[table] ?? [])}]` : 'missing'}`;
  }).join('|');

  // Two independent 32-bit lanes provide a compact stable marker without
  // adding a native crypto dependency to the React Native bundle.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
};
