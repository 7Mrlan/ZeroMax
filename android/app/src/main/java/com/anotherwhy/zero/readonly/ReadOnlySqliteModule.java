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

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
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
    private static final String TARGET_MARKER_SUFFIX = ".artifact.json";
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
            promise.resolve(readSnapshotRows(database));
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

    /** Reads a previously verified backup artifact, never the active source file. */
    @ReactMethod
    public void readBackupSnapshot(String backupId, Promise promise) {
        if (!isValidBackupId(backupId)) {
            promise.reject("INVALID_BACKUP_ID", "Invalid backup id");
            return;
        }
        File backupFile = new File(
                new File(getReactApplicationContext().getNoBackupFilesDir(), "zero-migration-backups"),
                backupId + "/watermelon.db"
        );
        if (!backupFile.isFile()) {
            promise.reject("BACKUP_MISSING", "Backup database file does not exist");
            return;
        }

        SQLiteDatabase database = null;
        try {
            database = SQLiteDatabase.openDatabase(
                    backupFile.getAbsolutePath(),
                    null,
                    SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS
            );
            if (!readIntegrity(database)) {
                promise.reject("BACKUP_INTEGRITY_FAILED", "Backup database failed SQLite integrity checks");
                return;
            }
            promise.resolve(readSnapshotRows(database));
        } catch (SQLiteException error) {
            promise.reject("BACKUP_SNAPSHOT_FAILED", error.getMessage(), error);
        } catch (Exception error) {
            promise.reject("BACKUP_SNAPSHOT_FAILED", error.getMessage(), error);
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
    public synchronized void inspectTargetArtifact(Promise promise) {
        File databaseFile = resolveDatabaseFile(TARGET_DATABASE_NAME);
        File walFile = new File(databaseFile.getAbsolutePath() + "-wal");
        File shmFile = new File(databaseFile.getAbsolutePath() + "-shm");
        File markerFile = targetMarkerFile(databaseFile);
        File markerTemporary = new File(markerFile.getAbsolutePath() + ".tmp");
        File markerClaim = targetMarkerClaimFile(markerFile);
        boolean databaseExists = databaseFile.isFile();
        boolean walExists = walFile.isFile();
        boolean shmExists = shmFile.isFile();
        boolean markerExists = markerFile.isFile();

        if (markerTemporary.exists() || markerClaim.exists()) {
            WritableMap invalid = Arguments.createMap();
            invalid.putString("status", "invalid-marker");
            promise.resolve(invalid);
            return;
        }

        if (!databaseExists && !walExists && !shmExists && !markerExists) {
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

        WritableMap marker = readMarker(markerFile);
        if (markerExists && marker == null) {
            WritableMap invalid = Arguments.createMap();
            invalid.putString("status", "invalid-marker");
            promise.resolve(invalid);
            return;
        }

        WritableMap present = Arguments.createMap();
        present.putString("status", "present");
        present.putMap("database", fileMetadata(databaseFile));
        present.putMap("wal", fileMetadataOrNull(walFile));
        present.putMap("shm", fileMetadataOrNull(shmFile));
        present.putMap("marker", marker);
        promise.resolve(present);
    }

    /** Claims an empty target with an exclusive, fsynced attempt marker. */
    @ReactMethod
    public synchronized void claimTargetArtifact(String attemptId, int generation, String sourceFingerprint, Promise promise) {
        if (!isValidMarkerText(attemptId) || !isValidMarkerText(sourceFingerprint) || generation <= 0) {
            promise.reject("INVALID_TARGET_MARKER", "Invalid target marker identity");
            return;
        }

        File databaseFile = resolveDatabaseFile(TARGET_DATABASE_NAME);
        File markerFile = targetMarkerFile(databaseFile);
        File markerClaim = targetMarkerClaimFile(markerFile);
        if (databaseFile.exists()
                || new File(databaseFile.getAbsolutePath() + "-wal").exists()
                || new File(databaseFile.getAbsolutePath() + "-shm").exists()
                || markerFile.exists()
                || markerClaim.exists()) {
            promise.reject("TARGET_NOT_FRESH", "Target database or marker already exists");
            return;
        }

        JSONObject marker = new JSONObject();
        try {
            marker.put("attemptId", attemptId);
            marker.put("generation", generation);
            marker.put("sourceFingerprint", sourceFingerprint);
            marker.put("status", "writing");
            if (!markerClaim.createNewFile()) {
                promise.reject("TARGET_NOT_FRESH", "Target marker already exists");
                return;
            }
            try {
                writeMarker(markerFile, marker);
            } catch (Exception error) {
                throw error;
            }
            //noinspection ResultOfMethodCallIgnored
            markerClaim.delete();
            WritableMap result = Arguments.createMap();
            result.putString("status", "claimed");
            promise.resolve(result);
        } catch (Exception error) {
            promise.reject("TARGET_MARKER_FAILED", error.getMessage(), error);
        }
    }

    /** Claims a fresh-install target with its final ownership marker in one native call. */
    @ReactMethod
    public synchronized void claimFreshTargetArtifact(
            String attemptId,
            int generation,
            String sourceFingerprint,
            String targetFingerprint,
            Promise promise
    ) {
        if (!isValidMarkerText(attemptId)
                || !isValidMarkerText(sourceFingerprint)
                || !isValidMarkerText(targetFingerprint)
                || generation <= 0) {
            promise.reject("INVALID_TARGET_MARKER", "Invalid fresh target marker identity");
            return;
        }

        File databaseFile = resolveDatabaseFile(TARGET_DATABASE_NAME);
        File markerFile = targetMarkerFile(databaseFile);
        File markerClaim = targetMarkerClaimFile(markerFile);
        if (databaseFile.exists()
                || new File(databaseFile.getAbsolutePath() + "-wal").exists()
                || new File(databaseFile.getAbsolutePath() + "-shm").exists()
                || markerFile.exists()
                || markerClaim.exists()) {
            promise.reject("TARGET_NOT_FRESH", "Target database or marker already exists");
            return;
        }

        JSONObject marker = new JSONObject();
        try {
            marker.put("attemptId", attemptId);
            marker.put("generation", generation);
            marker.put("sourceFingerprint", sourceFingerprint);
            marker.put("status", "activated");
            marker.put("targetFingerprint", targetFingerprint);
            if (!markerClaim.createNewFile()) {
                promise.reject("TARGET_NOT_FRESH", "Target marker already exists");
                return;
            }
            try {
                writeMarker(markerFile, marker);
            } catch (Exception error) {
                throw error;
            }
            //noinspection ResultOfMethodCallIgnored
            markerClaim.delete();
            promise.resolve(Arguments.createMap());
        } catch (Exception error) {
            promise.reject("TARGET_MARKER_FAILED", error.getMessage(), error);
        }
    }

    /** Advances a marker only for the attempt that originally claimed it. */
    @ReactMethod
    public synchronized void updateTargetArtifactMarker(
            String attemptId,
            String status,
            String targetFingerprint,
            Promise promise
    ) {
        if (!isValidMarkerText(attemptId)
                || !("writing".equals(status) || "verified".equals(status) || "activated".equals(status))) {
            promise.reject("INVALID_TARGET_MARKER", "Invalid target marker update");
            return;
        }
        if (("verified".equals(status) || "activated".equals(status))
                && !isValidMarkerText(targetFingerprint)) {
            promise.reject("INVALID_TARGET_MARKER", "Verified target markers need a fingerprint");
            return;
        }

        File markerFile = targetMarkerFile(resolveDatabaseFile(TARGET_DATABASE_NAME));
        WritableMap existing = readMarker(markerFile);
        if (existing == null) {
            promise.reject("TARGET_MARKER_MISSING", "Target marker is missing or invalid");
            return;
        }
        if (!attemptId.equals(existing.getString("attemptId"))) {
            promise.reject("TARGET_MARKER_OWNER_MISMATCH", "Target marker belongs to another attempt");
            return;
        }

        String currentStatus = existing.getString("status");
        boolean validTransition = ("writing".equals(currentStatus)
                && ("writing".equals(status) || "verified".equals(status)))
                || ("verified".equals(currentStatus)
                && ("verified".equals(status) || "activated".equals(status)))
                || ("activated".equals(currentStatus) && "activated".equals(status));
        if (!validTransition) {
            promise.reject("TARGET_MARKER_TRANSITION", "Target marker status cannot move backwards");
            return;
        }

        try {
            JSONObject marker = new JSONObject();
            marker.put("attemptId", existing.getString("attemptId"));
            marker.put("generation", existing.getInt("generation"));
            marker.put("sourceFingerprint", existing.getString("sourceFingerprint"));
            marker.put("status", status);
            if (targetFingerprint != null && !targetFingerprint.isEmpty()) {
                marker.put("targetFingerprint", targetFingerprint);
            }
            writeMarker(markerFile, marker);
            promise.resolve(Arguments.createMap());
        } catch (Exception error) {
            promise.reject("TARGET_MARKER_FAILED", error.getMessage(), error);
        }
    }

    /** Deletes an inactive target only when its durable marker matches exactly. */
    @ReactMethod
    public synchronized void discardTargetArtifact(
            String attemptId,
            int generation,
            String sourceFingerprint,
            Promise promise
    ) {
        if (!isValidMarkerText(attemptId) || !isValidMarkerText(sourceFingerprint) || generation <= 0) {
            promise.reject("INVALID_TARGET_MARKER", "Invalid target discard identity");
            return;
        }
        File databaseFile = resolveDatabaseFile(TARGET_DATABASE_NAME);
        File markerFile = targetMarkerFile(databaseFile);
        WritableMap marker = readMarker(markerFile);
        if (marker == null
                || !attemptId.equals(marker.getString("attemptId"))
                || generation != marker.getInt("generation")
                || !sourceFingerprint.equals(marker.getString("sourceFingerprint"))) {
            promise.reject("TARGET_MARKER_OWNER_MISMATCH", "Target marker does not match discard identity");
            return;
        }
        if ("activated".equals(marker.getString("status"))) {
            promise.reject("TARGET_ACTIVE", "Activated target cannot be discarded");
            return;
        }

        File[] files = new File[]{
                databaseFile,
                new File(databaseFile.getAbsolutePath() + "-wal"),
                new File(databaseFile.getAbsolutePath() + "-shm"),
                markerFile,
                new File(markerFile.getAbsolutePath() + ".tmp"),
                targetMarkerClaimFile(markerFile)
        };
        try {
            for (File file : files) {
                if (file.exists() && !file.delete()) {
                    promise.reject("TARGET_DISCARD_FAILED", "Could not delete " + file.getName());
                    return;
                }
            }
            WritableMap result = Arguments.createMap();
            result.putString("status", "discarded");
            promise.resolve(result);
        } catch (Exception error) {
            promise.reject("TARGET_DISCARD_FAILED", error.getMessage(), error);
        }
    }

    /**
     * Creates a non-overwritable source backup while the source is opened
     * read-only. The database and both SQLite sidecars are hashed before and
     * after copying; any concurrent source change invalidates the backup.
     */
    @ReactMethod
    public synchronized void backupDatabase(String databaseName, String backupId, Promise promise) {
        if (!"watermelon".equals(databaseName) || !isValidBackupId(backupId)) {
            promise.reject("INVALID_BACKUP_REQUEST", "Only a valid watermelon backup id is supported");
            return;
        }

        File databaseFile = resolveDatabaseFile(databaseName);
        File[] sourceFiles = sqliteFiles(databaseFile);
        FileState[] before = captureStates(sourceFiles);
        if (before[0] == null) {
            promise.reject("DATABASE_MISSING", "Source database file does not exist");
            return;
        }

        SQLiteDatabase database = null;
        File backupDirectory = new File(
                new File(getReactApplicationContext().getNoBackupFilesDir(), "zero-migration-backups"),
                backupId
        );
        try {
            database = SQLiteDatabase.openDatabase(
                    databaseFile.getAbsolutePath(),
                    null,
                    SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS
            );
            if (!readIntegrity(database)) {
                promise.reject("SOURCE_INTEGRITY_FAILED", "Source database failed SQLite integrity checks");
                return;
            }
            if (backupDirectory.exists() || !backupDirectory.mkdirs()) {
                promise.reject("BACKUP_ALREADY_EXISTS", "Backup destination already exists");
                return;
            }

            File[] backupFiles = new File[]{
                    new File(backupDirectory, databaseFile.getName()),
                    new File(backupDirectory, databaseFile.getName() + "-wal"),
                    new File(backupDirectory, databaseFile.getName() + "-shm")
            };
            for (int index = 0; index < sourceFiles.length; index += 1) {
                if (before[index] != null) {
                    copyFile(sourceFiles[index], backupFiles[index]);
                }
            }

            FileState[] after = captureStates(sourceFiles);
            if (!sameSnapshot(before, after)) {
                deleteRecursively(backupDirectory);
                promise.reject("SOURCE_CHANGED", "Source database changed while the backup was copied");
                return;
            }
            FileState[] copied = captureStates(backupFiles);
            if (!sameContent(before, copied)) {
                deleteRecursively(backupDirectory);
                promise.reject("BACKUP_VERIFY_FAILED", "Backup content does not match the source");
                return;
            }

            WritableMap result = Arguments.createMap();
            result.putString("status", "backed-up");
            result.putString("backupId", backupId);
            result.putArray("files", describeStates(before));
            promise.resolve(result);
        } catch (SQLiteException error) {
            deleteRecursively(backupDirectory);
            promise.reject("BACKUP_FAILED", error.getMessage(), error);
        } catch (Exception error) {
            deleteRecursively(backupDirectory);
            promise.reject("BACKUP_FAILED", error.getMessage(), error);
        } finally {
            if (database != null) {
                database.close();
            }
        }
    }

    private File[] sqliteFiles(File databaseFile) {
        return new File[]{
                databaseFile,
                new File(databaseFile.getAbsolutePath() + "-wal"),
                new File(databaseFile.getAbsolutePath() + "-shm")
        };
    }

    private FileState[] captureStates(File[] files) {
        FileState[] states = new FileState[files.length];
        for (int index = 0; index < files.length; index += 1) {
            states[index] = files[index].isFile() ? fileState(files[index]) : null;
        }
        return states;
    }

    private FileState fileState(File file) {
        try {
            return new FileState(file.getName(), file.length(), file.lastModified(), sha256(file));
        } catch (IOException error) {
            throw new IllegalStateException("Could not hash " + file.getName(), error);
        }
    }

    private String sha256(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) >= 0) {
                    digest.update(buffer, 0, count);
                }
            }
            StringBuilder result = new StringBuilder(64);
            for (byte value : digest.digest()) {
                result.append(String.format(java.util.Locale.US, "%02x", value));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }

    private boolean sameContent(FileState[] left, FileState[] right) {
        if (left.length != right.length) {
            return false;
        }
        for (int index = 0; index < left.length; index += 1) {
            if (left[index] == null || right[index] == null) {
                if (left[index] != right[index]) {
                    return false;
                }
            } else if (left[index].size != right[index].size || !left[index].sha256.equals(right[index].sha256)) {
                return false;
            }
        }
        return true;
    }

    private boolean sameSnapshot(FileState[] left, FileState[] right) {
        if (!sameContent(left, right)) {
            return false;
        }
        for (int index = 0; index < left.length; index += 1) {
            if (left[index] != null && left[index].lastModified != right[index].lastModified) {
                return false;
            }
        }
        return true;
    }

    private WritableArray describeStates(FileState[] states) {
        WritableArray result = Arguments.createArray();
        for (FileState state : states) {
            if (state != null) {
                WritableMap item = Arguments.createMap();
                item.putString("name", state.name);
                item.putDouble("size", state.size);
                item.putDouble("lastModified", state.lastModified);
                item.putString("sha256", state.sha256);
                result.pushMap(item);
            }
        }
        return result;
    }

    private void copyFile(File source, File destination) throws IOException {
        try (FileInputStream input = new FileInputStream(source);
             FileOutputStream output = new FileOutputStream(destination, false)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                output.write(buffer, 0, count);
            }
            output.getFD().sync();
        }
    }

    private void deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static final class FileState {
        private final String name;
        private final long size;
        private final long lastModified;
        private final String sha256;

        private FileState(String name, long size, long lastModified, String sha256) {
            this.name = name;
            this.size = size;
            this.lastModified = lastModified;
            this.sha256 = sha256;
        }
    }

    private File targetMarkerFile(File databaseFile) {
        return new File(databaseFile.getAbsolutePath() + TARGET_MARKER_SUFFIX);
    }

    private File targetMarkerClaimFile(File markerFile) {
        return new File(markerFile.getAbsolutePath() + ".claim");
    }

    private boolean isValidMarkerText(String value) {
        return value != null && !value.trim().isEmpty() && value.length() <= 768;
    }

    private boolean isValidBackupId(String value) {
        return value != null && value.matches("[A-Za-z0-9._-]{1,128}");
    }

    private WritableMap readMarker(File markerFile) {
        if (!markerFile.isFile()) {
            return null;
        }
        if (markerFile.length() > 8192) {
            return null;
        }
        try {
            String content = readUtf8(markerFile);
            JSONObject marker = new JSONObject(content);
            String attemptId = marker.optString("attemptId", null);
            String sourceFingerprint = marker.optString("sourceFingerprint", null);
            String status = marker.optString("status", null);
            if (!isValidMarkerText(attemptId)
                    || marker.optInt("generation", 0) <= 0
                    || !isValidMarkerText(sourceFingerprint)
                    || !("writing".equals(status) || "verified".equals(status) || "activated".equals(status))) {
                return null;
            }
            WritableMap result = Arguments.createMap();
            result.putString("attemptId", attemptId);
            result.putInt("generation", marker.getInt("generation"));
            result.putString("sourceFingerprint", sourceFingerprint);
            result.putString("status", status);
            if (marker.has("targetFingerprint")) {
                result.putString("targetFingerprint", marker.getString("targetFingerprint"));
            }
            return result;
        } catch (IOException | JSONException error) {
            return null;
        }
    }

    private void writeMarker(File markerFile, JSONObject marker) throws IOException {
        File markerTemporary = new File(markerFile.getAbsolutePath() + ".tmp");
        try (FileOutputStream output = new FileOutputStream(markerTemporary, false)) {
            output.write(marker.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        try {
            Files.move(
                    markerTemporary.toPath(),
                    markerFile.toPath(),
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
            );
        } catch (UnsupportedOperationException error) {
            Files.move(markerTemporary.toPath(), markerFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private String readUtf8(File file) throws IOException {
        try (FileInputStream input = new FileInputStream(file);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                output.write(buffer, 0, count);
            }
            return output.toString("UTF-8");
        }
    }

    private WritableMap readSnapshotRows(SQLiteDatabase database) {
        WritableMap snapshot = Arguments.createMap();
        for (String table : INSPECTED_TABLES) {
            // Legacy Zero and Zerox files intentionally do not have the same
            // table set. Omit an absent table so JS can distinguish missing
            // schema from an empty table.
            if (tableExists(database, table)) {
                snapshot.putArray(table, readRows(database, table));
            }
        }
        return snapshot;
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
