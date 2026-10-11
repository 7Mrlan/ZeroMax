import {createAndroidSourceBackup, normalizeBackupDescriptor, readAndroidBackupSnapshot} from '../backupBridge';

const descriptor = {
  status: 'backed-up' as const,
  backupId: 'migration-1',
  files: [{name: 'watermelon.db', size: 100, lastModified: 200, sha256: 'a'.repeat(64)}],
};

describe('backup bridge', () => {
  it('validates a complete native backup descriptor', () => {
    expect(normalizeBackupDescriptor(descriptor)).toEqual(descriptor);
    expect(() => normalizeBackupDescriptor({...descriptor, files: [{...descriptor.files[0], sha256: 'bad'}]})).toThrow(
      'invalid descriptor',
    );
  });

  it('uses the fixed legacy database name', async () => {
    const backupDatabase = jest.fn(async () => descriptor);
    await expect(
      createAndroidSourceBackup('migration-1', {backupDatabase, readBackupSnapshot: async () => ({})}),
    ).resolves.toEqual(descriptor);
    expect(backupDatabase).toHaveBeenCalledWith('watermelon', 'migration-1');
  });

  it('fails closed when the native backup bridge is unavailable', async () => {
    await expect(
      createAndroidSourceBackup('migration-1', {readBackupSnapshot: async () => ({})} as never),
    ).rejects.toThrow('unavailable');
  });

  it('reads rows only through the fixed backup id', async () => {
    const readBackupSnapshot = jest.fn(async (backupId: string) => ({users: [{id: backupId}]}));
    await expect(readAndroidBackupSnapshot('migration-1', {readBackupSnapshot})).resolves.toEqual({
      users: [{id: 'migration-1'}],
    });
    expect(readBackupSnapshot).toHaveBeenCalledWith('migration-1');
  });
});
