import {fingerprintCopyDataset} from '../copyFingerprint';
import type {CopyDataset} from '../copyVerification';

const row = (id: string, title: string) => ({id, title, _status: 'synced', _changed: ''});

describe('fingerprintCopyDataset', () => {
  it('is stable across row order and object key order', () => {
    const left: CopyDataset = {expenses: [row('e2', 'Dinner'), row('e1', 'Lunch')]};
    const right: CopyDataset = {
      expenses: [
        {_changed: '', _status: 'synced', title: 'Lunch', id: 'e1'},
        {_changed: '', _status: 'synced', title: 'Dinner', id: 'e2'},
      ],
    };
    expect(fingerprintCopyDataset(left)).toBe(fingerprintCopyDataset(right));
  });

  it('distinguishes a missing table from an empty table', () => {
    expect(fingerprintCopyDataset({})).not.toBe(fingerprintCopyDataset({expenses: []}));
  });

  it('changes when persisted content changes', () => {
    expect(fingerprintCopyDataset({expenses: [row('e1', 'Lunch')]})).not.toBe(
      fingerprintCopyDataset({expenses: [row('e1', 'Dinner')]}),
    );
  });

  it('rejects non-finite numeric values instead of producing an ambiguous marker', () => {
    expect(() => fingerprintCopyDataset({expenses: [row('e1', 'Lunch'), {id: 'e2', amount: Number.NaN}]})).toThrow(
      'non-finite number',
    );
  });
});
