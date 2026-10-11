'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = {
  readOnly: path.join(root, 'ios/zero/ZeroReadOnlySqlite.m'),
  readOnlyHeader: path.join(root, 'ios/zero/ZeroReadOnlySqlite.h'),
  secure: path.join(root, 'ios/zero/ZeroSecureSecrets.m'),
  secureHeader: path.join(root, 'ios/zero/ZeroSecureSecrets.h'),
  project: path.join(root, 'ios/zero.xcodeproj/project.pbxproj'),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    throw new Error(`iOS native contract file is missing: ${name} (${file})`);
  }
}

const readOnly = fs.readFileSync(files.readOnly, 'utf8');
const secure = fs.readFileSync(files.secure, 'utf8');
const project = fs.readFileSync(files.project, 'utf8');

const requireText = (source, text, description) => {
  if (!source.includes(text)) throw new Error(`iOS native contract missing ${description}`);
};
const forbidText = (source, text, description) => {
  if (source.includes(text)) throw new Error(`iOS native contract violates ${description}`);
};

requireText(readOnly, 'RCT_EXPORT_MODULE(ZeroReadOnlySqlite)', 'readonly module export');
requireText(readOnly, 'RCT_EXPORT_METHOD(probe:', 'readonly probe method');
requireText(readOnly, 'RCT_EXPORT_METHOD(readSnapshot:', 'readonly snapshot method');
requireText(readOnly, 'SQLITE_OPEN_READONLY', 'read-only SQLite open flag');
requireText(readOnly, 'PRAGMA integrity_check', 'SQLite integrity check');
requireText(readOnly, 'watermelon_v4', 'target database allow-list');
forbidText(readOnly, 'SQLITE_OPEN_CREATE', 'must never create a source database');
forbidText(readOnly, 'SQLITE_OPEN_READWRITE', 'must never open the source database for writing');
forbidText(readOnly, 'sqlite3_exec', 'must keep all inspection SQL parameterized or fixed');

requireText(secure, 'RCT_EXPORT_MODULE(ZeroSecureSecrets)', 'secure module export');
requireText(secure, 'SecItemCopyMatching', 'Keychain read');
requireText(secure, '#import <Security/Security.h>', 'Security framework header');
requireText(secure, 'SecItemUpdate', 'Keychain update');
requireText(secure, 'SecItemAdd', 'Keychain insert');
requireText(secure, 'SecItemDelete', 'Keychain delete');
requireText(secure, 'kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly', 'device-only Keychain accessibility');
requireText(secure, 'ai_api_key', 'secret allow-list');
forbidText(secure, 'NSLog', 'must never log secret values');
forbidText(secure, 'print(', 'must never print secret values');

for (const file of ['ZeroReadOnlySqlite.m', 'ZeroReadOnlySqlite.h', 'ZeroSecureSecrets.m', 'ZeroSecureSecrets.h']) {
  requireText(project, file, `Xcode project reference for ${file}`);
}
requireText(project, 'ZeroReadOnlySqlite.m in Sources', 'readonly source build phase');
requireText(project, 'ZeroSecureSecrets.m in Sources', 'secure source build phase');
requireText(project, 'Security.framework in Frameworks', 'Security framework link');

console.log('iOS native source contract validated (static only; Xcode/Pods/device smoke remains external).');
