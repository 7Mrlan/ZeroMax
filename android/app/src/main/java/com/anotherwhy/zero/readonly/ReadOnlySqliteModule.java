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

    private File resolveDatabaseFile(String databaseName) {
        // Keep this resolver byte-for-byte aligned with WatermelonDB's Android
        // driver. The replacement removes the framework's /databases segment.
        String path = getReactApplicationContext()
                .getDatabasePath(databaseName + ".db")
                .getPath()
                .replace("/databases", "");
        return new File(path);
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

    private boolean readIntegrity(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("PRAGMA integrity_check", null)) {
            if (!cursor.moveToFirst()) {
                return false;
            }
            return "ok".equalsIgnoreCase(cursor.getString(0));
        }
    }
}
