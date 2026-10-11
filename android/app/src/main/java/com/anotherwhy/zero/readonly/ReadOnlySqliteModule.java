package com.anotherwhy.zero.readonly;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteException;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Read-only metadata probe for the migration preflight.
 *
 * This module deliberately does not use WatermelonDB's SQLiteAdapter: that
 * adapter opens with CREATE_IF_NECESSARY and may run migrations or reset an
 * unknown schema before JavaScript can inspect it.
 */
public final class ReadOnlySqliteModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "ZeroReadOnlySqlite";
    private static final String TARGET_DATABASE_NAME = "watermelon_v4";
    private static final Set<String> ALLOWED_DATABASES = new HashSet<>(
            Arrays.asList("watermelon", "watermelon_v4")
    );
    private static final String[] INSPECTED_TABLES = new String[]{
            "users", "categories", "expenses", "incomes", "currencies", "debtors", "debts", "budgets"
    };

    public ReadOnlySqliteModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void probe(String databaseName, Promise promise) {
        if (!ALLOWED_DATABASES.contains(databaseName)) {
            promise.reject("UNSUPPORTED_DATABASE", "Unsupported database name for read-only probe");
            return;
        }

        File databaseFile = resolveDatabaseFile(databaseName);
        if (!databaseFile.isFile()) {
            WritableMap missing = Arguments.createMap();
            missing.putString("status", "missing");
            promise.resolve(missing);
            return;
        }

        SQLiteDatabase database = null;
        try {
            // OPEN_READONLY is the critical safety property. Do not add
            // CREATE_IF_NECESSARY or enableWriteAheadLogging here.
            database = SQLiteDatabase.openDatabase(
                    databaseFile.getAbsolutePath(),
                    null,
                    SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS
            );

            WritableMap result = Arguments.createMap();
            result.putString("status", "ready");
            result.putInt("version", database.getVersion());
            result.putMap("tables", readColumns(database));
            result.putMap("indexes", readIndexes(database));
            result.putString("integrity", readIntegrity(database) ? "ok" : "failed");
            promise.resolve(result);
        } catch (SQLiteException error) {
            promise.reject("SQLITE_PROBE_FAILED", error.getMessage(), error);
        } catch (Exception error) {
            promise.reject("SQLITE_PROBE_FAILED", error.getMessage(), error);
        } finally {
            if (database != null) {
                database.close();
            }
        }
    }

    /** Reads all allow-listed rows through one read-only SQLite connection. */
    @ReactMethod
    public void readSnapshot(String databaseName, Promise promise) {
        if (!ALLOWED_DATABASES.contains(databaseName)) {
            promise.reject("UNSUPPORTED_DATABASE", "Unsupported database name for read-only snapshot");
            return;
        }

        File databaseFile = resolveDatabaseFile(databaseName);
        if (!databaseFile.isFile()) {
            promise.reject("DATABASE_MISSING", "Database file does not exist");
            return;
        }

        SQLiteDatabase database = null;
        try {
            database = SQLiteDatabase.openDatabase(
                    databaseFile.getAbsolutePath(),
                    null,
                    SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS
            );
            WritableMap snapshot = Arguments.createMap();
            for (String table : INSPECTED_TABLES) {
                // Legacy Zero and Zerox files intentionally do not have the
                // same table set. Omit an absent table so JS can distinguish
                // "not present in this legacy shape" from an empty table.
                if (tableExists(database, table)) {
                    snapshot.putArray(table, readRows(database, table));
                }
            }
            promise.resolve(snapshot);
        } catch (SQLiteException error) {
            promise.reject("SQLITE_SNAPSHOT_FAILED", error.getMessage(), error);
        } catch (Exception error) {
            promise.reject("SQLITE_SNAPSHOT_FAILED", error.getMessage(), error);
        } finally {
            if (database != null) {
                database.close();
            }
        }
    }

    /**
     * Inspects the inactive v4 artifact without opening it through
     * WatermelonDB. The JS checkpoint decides whether a present artifact is
     * owned by the current attempt before any discard operation is allowed.
     */
    @ReactMethod
    public void inspectTargetArtifact(Promise promise) {
        File databaseFile = resolveDatabaseFile(TARGET_DATABASE_NAME);
        File walFile = new File(databaseFile.getAbsolutePath() + "-wal");
        File shmFile = new File(databaseFile.getAbsolutePath() + "-shm");
        boolean databaseExists = databaseFile.isFile();
        boolean walExists = walFile.isFile();
        boolean shmExists = shmFile.isFile();

        if (!databaseExists && !walExists && !shmExists) {
            WritableMap missing = Arguments.createMap();
            missing.putString("status", "missing");
            promise.resolve(missing);
            return;
        }

        if (!databaseExists) {
            WritableMap orphaned = Arguments.createMap();
            orphaned.putString("status", "orphaned");
            promise.resolve(orphaned);
            return;
        }

        WritableMap present = Arguments.createMap();
        present.putString("status", "present");
        present.putMap("database", fileMetadata(databaseFile));
        present.putMap("wal", fileMetadataOrNull(walFile));
        present.putMap("shm", fileMetadataOrNull(shmFile));
        promise.resolve(present);
    }

    private File resolveDatabaseFile(String databaseName) {
        // Keep this resolver byte-for-byte aligned with WatermelonDB's Android
        // driver. The replacement removes the framework's /databases segment.
        String path = getReactApplicationContext()
                .getDatabasePath(databaseName + ".db")
                .getPath()
                .replace("/databases", "");
        return new File(path);
    }

    private WritableMap fileMetadata(File file) {
        WritableMap metadata = Arguments.createMap();
        metadata.putDouble("size", file.length());
        metadata.putDouble("lastModified", file.lastModified());
        return metadata;
    }

    private WritableMap fileMetadataOrNull(File file) {
        return file.isFile() ? fileMetadata(file) : null;
    }

    private WritableMap readColumns(SQLiteDatabase database) {
        WritableMap tables = Arguments.createMap();
        for (String table : INSPECTED_TABLES) {
            WritableArray columns = Arguments.createArray();
            try (Cursor cursor = database.rawQuery("PRAGMA table_info(\"" + table + "\")", null)) {
                int nameIndex = cursor.getColumnIndex("name");
                while (cursor.moveToNext()) {
                    columns.pushString(cursor.getString(nameIndex));
                }
            }
            if (columns.size() > 0) {
                tables.putArray(table, columns);
            }
        }
        return tables;
    }

    private WritableMap readIndexes(SQLiteDatabase database) {
        WritableMap indexes = Arguments.createMap();
        for (String table : INSPECTED_TABLES) {
            WritableArray tableIndexes = Arguments.createArray();
            try (Cursor cursor = database.rawQuery("PRAGMA index_list(\"" + table + "\")", null)) {
                int nameIndex = cursor.getColumnIndex("name");
                while (cursor.moveToNext()) {
                    tableIndexes.pushString(cursor.getString(nameIndex));
                }
            }
            if (tableIndexes.size() > 0) {
                indexes.putArray(table, tableIndexes);
            }
        }
        return indexes;
    }

    private WritableArray readRows(SQLiteDatabase database, String table) {
        WritableArray rows = Arguments.createArray();
        try (Cursor cursor = database.rawQuery("SELECT * FROM \"" + table + "\"", null)) {
            String[] columns = cursor.getColumnNames();
            while (cursor.moveToNext()) {
                WritableMap row = Arguments.createMap();
                for (int index = 0; index < columns.length; index++) {
                    putCursorValue(row, columns[index], cursor, index, table);
                }
                rows.pushMap(row);
            }
        }
        return rows;
    }

    private boolean tableExists(SQLiteDatabase database, String table) {
        try (Cursor cursor = database.rawQuery(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
                new String[]{table}
        )) {
            return cursor.moveToFirst();
        }
    }

    private void putCursorValue(WritableMap row, String column, Cursor cursor, int index, String table) {
        if (cursor.isNull(index)) {
            row.putNull(column);
            return;
        }
        int type = cursor.getType(index);
        if (type == Cursor.FIELD_TYPE_INTEGER && isBooleanColumn(table, column)) {
            row.putBoolean(column, cursor.getInt(index) != 0);
        } else if (type == Cursor.FIELD_TYPE_INTEGER || type == Cursor.FIELD_TYPE_FLOAT) {
            row.putDouble(column, cursor.getDouble(index));
        } else if (type == Cursor.FIELD_TYPE_STRING) {
            row.putString(column, cursor.getString(index));
        } else {
            throw new SQLiteException("Unsupported SQLite value type for " + table + "." + column);
        }
    }

    private boolean isBooleanColumn(String table, String column) {
        return ("categories".equals(table) && "category_status".equals(column))
                || ("debtors".equals(table) && "debtor_status".equals(column));
    }

    private boolean readIntegrity(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("PRAGMA integrity_check", null)) {
            if (!cursor.moveToFirst()) {
                return false;
            }
            return "ok".equalsIgnoreCase(cursor.getString(0));
        }
    }
}
