#import "ZeroReadOnlySqlite.h"

#import <sqlite3.h>
#include <string.h>

static NSString *const ZeroReadOnlySqliteErrorDomain = @"ZeroReadOnlySqlite";
static NSArray<NSString *> *ZeroInspectedTables(void) {
  return @[@"users", @"categories", @"expenses", @"incomes", @"currencies", @"debtors", @"debts", @"budgets"];
}

@implementation ZeroReadOnlySqlite

RCT_EXPORT_MODULE(ZeroReadOnlySqlite)

+ (dispatch_queue_t)methodQueue {
  // SQLite inspection is file I/O. Keep calls serialized so two preflight
  // requests cannot race the same read-only connection or error state.
  static dispatch_queue_t queue;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    queue = dispatch_queue_create("com.anotherwhy.zero.readonly-sqlite", DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

RCT_EXPORT_METHOD(probe:(NSString *)databaseName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (![self isAllowedDatabaseName:databaseName]) {
    reject(@"UNSUPPORTED_DATABASE", @"Unsupported database name for read-only probe", nil);
    return;
  }

  NSError *pathError = nil;
  NSString *path = [self pathForDatabaseName:databaseName error:&pathError];
  if (path == nil) {
    reject(@"SQLITE_PROBE_FAILED", pathError.localizedDescription, pathError);
    return;
  }

  BOOL isDirectory = NO;
  if (![[NSFileManager defaultManager] fileExistsAtPath:path isDirectory:&isDirectory] || isDirectory) {
    resolve(@{@"status": @"missing"});
    return;
  }

  sqlite3 *database = NULL;
  NSError *openError = nil;
  if (![self openDatabaseAtPath:path database:&database error:&openError]) {
    reject(@"SQLITE_PROBE_FAILED", openError.localizedDescription, openError);
    return;
  }

  NSError *queryError = nil;
  NSDictionary *columns = [self readColumnsFromDatabase:database error:&queryError];
  NSDictionary *indexes = queryError == nil ? [self readIndexesFromDatabase:database error:&queryError] : nil;
  NSNumber *version = queryError == nil ? [self readUserVersionFromDatabase:database error:&queryError] : nil;
  BOOL integrityOK = NO;
  if (queryError == nil) {
    integrityOK = [self readIntegrityFromDatabase:database error:&queryError];
  }
  sqlite3_close(database);

  if (queryError != nil || columns == nil || indexes == nil || version == nil) {
    NSError *error = queryError ?: [self errorWithCode:1 description:@"Read-only SQLite probe returned no metadata"];
    reject(@"SQLITE_PROBE_FAILED", error.localizedDescription, error);
    return;
  }

  resolve(@{
    @"status": @"ready",
    @"version": version,
    @"tables": columns,
    @"indexes": indexes,
    @"integrity": integrityOK ? @"ok" : @"failed",
  });
}

RCT_EXPORT_METHOD(readSnapshot:(NSString *)databaseName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (![self isAllowedDatabaseName:databaseName]) {
    reject(@"UNSUPPORTED_DATABASE", @"Unsupported database name for read-only snapshot", nil);
    return;
  }

  NSError *pathError = nil;
  NSString *path = [self pathForDatabaseName:databaseName error:&pathError];
  if (path == nil) {
    reject(@"SQLITE_SNAPSHOT_FAILED", pathError.localizedDescription, pathError);
    return;
  }

  BOOL isDirectory = NO;
  if (![[NSFileManager defaultManager] fileExistsAtPath:path isDirectory:&isDirectory] || isDirectory) {
    reject(@"DATABASE_MISSING", @"Database file does not exist", nil);
    return;
  }

  sqlite3 *database = NULL;
  NSError *openError = nil;
  if (![self openDatabaseAtPath:path database:&database error:&openError]) {
    reject(@"SQLITE_SNAPSHOT_FAILED", openError.localizedDescription, openError);
    return;
  }

  NSError *snapshotError = nil;
  NSDictionary *snapshot = [self readSnapshotFromDatabase:database error:&snapshotError];
  sqlite3_close(database);
  if (snapshot == nil || snapshotError != nil) {
    NSError *error = snapshotError ?: [self errorWithCode:2 description:@"Read-only SQLite snapshot returned no rows"];
    reject(@"SQLITE_SNAPSHOT_FAILED", error.localizedDescription, error);
    return;
  }
  resolve(snapshot);
}

#pragma mark - Path and connection

- (BOOL)isAllowedDatabaseName:(NSString *)databaseName {
  return [databaseName isEqualToString:@"watermelon"] || [databaseName isEqualToString:@"watermelon_v4"];
}

- (nullable NSString *)pathForDatabaseName:(NSString *)databaseName error:(NSError **)error {
  if (![self isAllowedDatabaseName:databaseName]) {
    if (error != NULL) {
      *error = [self errorWithCode:3 description:@"Unsupported database name"];
    }
    return nil;
  }

  NSError *directoryError = nil;
  NSURL *documentsURL = [[NSFileManager defaultManager] URLForDirectory:NSDocumentDirectory
                                                                  inDomain:NSUserDomainMask
                                                         appropriateForURL:nil
                                                                    create:NO
                                                                     error:&directoryError];
  if (documentsURL == nil) {
    if (error != NULL) {
      *error = directoryError ?: [self errorWithCode:4 description:@"Application Documents directory is unavailable"];
    }
    return nil;
  }
  return [[documentsURL URLByAppendingPathComponent:[databaseName stringByAppendingString:@".db"]] path];
}

- (BOOL)openDatabaseAtPath:(NSString *)path database:(sqlite3 **)database error:(NSError **)error {
  // READONLY is deliberate. Do not add a create or write flag: a missing or
  // inaccessible file must stay a preflight error, never become a new DB.
  int result = sqlite3_open_v2(path.UTF8String, database, SQLITE_OPEN_READONLY, NULL);
  if (result == SQLITE_OK) {
    return YES;
  }

  NSString *message = *database == NULL ? @"SQLite could not open the database" : [NSString stringWithUTF8String:sqlite3_errmsg(*database)];
  if (*database != NULL) {
    sqlite3_close(*database);
    *database = NULL;
  }
  if (error != NULL) {
    *error = [self errorWithCode:result description:message ?: @"SQLite open failed"];
  }
  return NO;
}

#pragma mark - Metadata

- (nullable NSDictionary *)readColumnsFromDatabase:(sqlite3 *)database error:(NSError **)error {
  return [self readPragmaValuesFromDatabase:database format:@"PRAGMA table_info(\"%@\")" valueColumn:1 error:error];
}

- (nullable NSDictionary *)readIndexesFromDatabase:(sqlite3 *)database error:(NSError **)error {
  return [self readPragmaValuesFromDatabase:database format:@"PRAGMA index_list(\"%@\")" valueColumn:1 error:error];
}

- (nullable NSDictionary *)readPragmaValuesFromDatabase:(sqlite3 *)database
                                                  format:(NSString *)format
                                            valueColumn:(int)valueColumn
                                                  error:(NSError **)error {
  NSMutableDictionary *result = [NSMutableDictionary dictionary];
  for (NSString *table in ZeroInspectedTables()) {
    NSString *sql = [NSString stringWithFormat:format, table];
    sqlite3_stmt *statement = NULL;
    int prepareResult = sqlite3_prepare_v2(database, sql.UTF8String, -1, &statement, NULL);
    if (prepareResult != SQLITE_OK) {
      if (error != NULL) {
        *error = [self sqliteErrorFromDatabase:database code:prepareResult description:@"SQLite metadata query failed"];
      }
      return nil;
    }

    NSMutableArray *values = [NSMutableArray array];
    int stepResult = SQLITE_ROW;
    while ((stepResult = sqlite3_step(statement)) == SQLITE_ROW) {
      const unsigned char *text = sqlite3_column_text(statement, valueColumn);
      if (text == NULL) {
        sqlite3_finalize(statement);
        if (error != NULL) {
          *error = [self errorWithCode:5 description:@"SQLite metadata contains a null identifier"];
        }
        return nil;
      }
      NSString *value = [NSString stringWithUTF8String:(const char *)text];
      if (value == nil) {
        sqlite3_finalize(statement);
        if (error != NULL) {
          *error = [self errorWithCode:5 description:@"SQLite metadata contains invalid UTF-8"];
        }
        return nil;
      }
      [values addObject:value];
    }
    sqlite3_finalize(statement);
    if (stepResult != SQLITE_DONE) {
      if (error != NULL) {
        *error = [self sqliteErrorFromDatabase:database code:stepResult description:@"SQLite metadata query did not finish"];
      }
      return nil;
    }
    if (values.count > 0) {
      result[table] = values;
    }
  }
  return result;
}

- (nullable NSNumber *)readUserVersionFromDatabase:(sqlite3 *)database error:(NSError **)error {
  sqlite3_stmt *statement = NULL;
  int prepareResult = sqlite3_prepare_v2(database, "PRAGMA user_version", -1, &statement, NULL);
  if (prepareResult != SQLITE_OK) {
    if (error != NULL) {
      *error = [self sqliteErrorFromDatabase:database code:prepareResult description:@"SQLite user_version query failed"];
    }
    return nil;
  }
  int stepResult = sqlite3_step(statement);
  if (stepResult != SQLITE_ROW) {
    sqlite3_finalize(statement);
    if (error != NULL) {
      *error = [self sqliteErrorFromDatabase:database code:stepResult description:@"SQLite user_version query returned no row"];
    }
    return nil;
  }
  NSNumber *version = @(sqlite3_column_int64(statement, 0));
  sqlite3_finalize(statement);
  return version;
}

- (BOOL)readIntegrityFromDatabase:(sqlite3 *)database error:(NSError **)error {
  sqlite3_stmt *statement = NULL;
  int prepareResult = sqlite3_prepare_v2(database, "PRAGMA integrity_check", -1, &statement, NULL);
  if (prepareResult != SQLITE_OK) {
    if (error != NULL) {
      *error = [self sqliteErrorFromDatabase:database code:prepareResult description:@"SQLite integrity check could not start"];
    }
    return NO;
  }
  int stepResult = sqlite3_step(statement);
  const unsigned char *text = stepResult == SQLITE_ROW ? sqlite3_column_text(statement, 0) : NULL;
  BOOL ok = text != NULL && strcmp((const char *)text, "ok") == 0;
  sqlite3_finalize(statement);
  if (stepResult != SQLITE_ROW && error != NULL) {
    *error = [self sqliteErrorFromDatabase:database code:stepResult description:@"SQLite integrity check returned no result"];
  }
  return ok;
}

#pragma mark - Snapshot

- (nullable NSDictionary *)readSnapshotFromDatabase:(sqlite3 *)database error:(NSError **)error {
  NSMutableDictionary *snapshot = [NSMutableDictionary dictionary];
  for (NSString *table in ZeroInspectedTables()) {
    BOOL exists = [self tableExists:table database:database error:error];
    if (error != NULL && *error != nil) {
      return nil;
    }
    if (!exists) {
      // Zero and Zerox legacy files intentionally have different table sets.
      continue;
    }
    NSArray *rows = [self readRowsFromTable:table database:database error:error];
    if (rows == nil) {
      return nil;
    }
    snapshot[table] = rows;
  }
  return snapshot;
}

- (BOOL)tableExists:(NSString *)table database:(sqlite3 *)database error:(NSError **)error {
  sqlite3_stmt *statement = NULL;
  int prepareResult = sqlite3_prepare_v2(database,
                                         "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
                                         -1,
                                         &statement,
                                         NULL);
  if (prepareResult != SQLITE_OK) {
    if (error != NULL) {
      *error = [self sqliteErrorFromDatabase:database code:prepareResult description:@"SQLite table lookup failed"];
    }
    return NO;
  }
  sqlite3_bind_text(statement, 1, table.UTF8String, -1, SQLITE_TRANSIENT);
  int stepResult = sqlite3_step(statement);
  BOOL exists = stepResult == SQLITE_ROW;
  sqlite3_finalize(statement);
  if (stepResult != SQLITE_ROW && stepResult != SQLITE_DONE && error != NULL) {
    *error = [self sqliteErrorFromDatabase:database code:stepResult description:@"SQLite table lookup did not finish"];
  }
  return exists;
}

- (nullable NSArray *)readRowsFromTable:(NSString *)table database:(sqlite3 *)database error:(NSError **)error {
  // `table` comes only from ZeroInspectedTables(), so identifier quoting is
  // safe without constructing SQL from user input.
  NSString *sql = [NSString stringWithFormat:@"SELECT * FROM \"%@\"", table];
  sqlite3_stmt *statement = NULL;
  int prepareResult = sqlite3_prepare_v2(database, sql.UTF8String, -1, &statement, NULL);
  if (prepareResult != SQLITE_OK) {
    if (error != NULL) {
      *error = [self sqliteErrorFromDatabase:database code:prepareResult description:@"SQLite row query failed"];
    }
    return nil;
  }

  int columnCount = sqlite3_column_count(statement);
  NSMutableArray *rows = [NSMutableArray array];
  int stepResult = SQLITE_ROW;
  while ((stepResult = sqlite3_step(statement)) == SQLITE_ROW) {
    NSMutableDictionary *row = [NSMutableDictionary dictionaryWithCapacity:(NSUInteger)columnCount];
    for (int column = 0; column < columnCount; column += 1) {
      const char *name = sqlite3_column_name(statement, column);
      if (name == NULL) {
        sqlite3_finalize(statement);
        if (error != NULL) {
          *error = [self errorWithCode:6 description:@"SQLite row contains an unnamed column"];
        }
        return nil;
      }
      NSString *columnName = [NSString stringWithUTF8String:name];
      if (columnName == nil) {
        sqlite3_finalize(statement);
        if (error != NULL) {
          *error = [self errorWithCode:6 description:@"SQLite row contains an invalid UTF-8 column name"];
        }
        return nil;
      }
      id value = [self valueForStatement:statement column:column table:table columnName:columnName error:error];
      if (value == nil) {
        sqlite3_finalize(statement);
        return nil;
      }
      row[columnName] = value;
    }
    [rows addObject:row];
  }
  sqlite3_finalize(statement);
  if (stepResult != SQLITE_DONE) {
    if (error != NULL) {
      *error = [self sqliteErrorFromDatabase:database code:stepResult description:@"SQLite row query did not finish"];
    }
    return nil;
  }
  return rows;
}

- (nullable id)valueForStatement:(sqlite3_stmt *)statement
                        column:(int)column
                         table:(NSString *)table
                    columnName:(NSString *)columnName
                          error:(NSError **)error {
  int type = sqlite3_column_type(statement, column);
  if (type == SQLITE_NULL) {
    return [NSNull null];
  }
  if (type == SQLITE_INTEGER) {
    if (([table isEqualToString:@"categories"] && [columnName isEqualToString:@"category_status"]) ||
        ([table isEqualToString:@"debtors"] && [columnName isEqualToString:@"debtor_status"])) {
      return @(sqlite3_column_int(statement, column) != 0);
    }
    return @(sqlite3_column_double(statement, column));
  }
  if (type == SQLITE_FLOAT) {
    return @(sqlite3_column_double(statement, column));
  }
  if (type == SQLITE_TEXT) {
    const unsigned char *text = sqlite3_column_text(statement, column);
    if (text == NULL) {
      if (error != NULL) {
        *error = [self errorWithCode:7 description:@"SQLite text value is not valid UTF-8"];
      }
      return nil;
    }
    NSString *value = [NSString stringWithUTF8String:(const char *)text];
    if (value == nil && error != NULL) {
      *error = [self errorWithCode:7 description:@"SQLite text value is not valid UTF-8"];
    }
    return value;
  }
  if (error != NULL) {
    *error = [self errorWithCode:8 description:[NSString stringWithFormat:@"Unsupported SQLite value type for %@.%@", table, columnName]];
  }
  return nil;
}

#pragma mark - Errors

- (NSError *)errorWithCode:(NSInteger)code description:(NSString *)description {
  return [NSError errorWithDomain:ZeroReadOnlySqliteErrorDomain
                              code:code
                          userInfo:@{NSLocalizedDescriptionKey: description}];
}

- (NSError *)sqliteErrorFromDatabase:(sqlite3 *)database code:(int)code description:(NSString *)description {
  const char *sqliteMessage = sqlite3_errmsg(database);
  NSString *message = sqliteMessage == NULL ? description : [NSString stringWithFormat:@"%@ (%s)", description, sqliteMessage];
  return [self errorWithCode:code description:message];
}

@end
