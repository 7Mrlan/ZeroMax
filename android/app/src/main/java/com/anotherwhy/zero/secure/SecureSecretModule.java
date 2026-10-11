package com.anotherwhy.zero.secure;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores AI secrets encrypted by an Android Keystore AES-GCM key. */
public final class SecureSecretModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "ZeroSecureSecrets";
    private static final String KEY_ALIAS = "zero_ai_secret_key";
    private static final String PREFS = "zero_secure_secrets";
    private static final String API_KEY = "ai_api_key";

    public SecureSecretModule(ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void getSecret(String name, Promise promise) {
        if (!API_KEY.equals(name)) {
            promise.reject("UNSUPPORTED_SECRET", "Unsupported secret name");
            return;
        }
        try {
            String stored = preferences().getString(API_KEY, null);
            promise.resolve(stored == null ? null : decrypt(stored));
        } catch (Exception error) {
            promise.reject("SECRET_READ_FAILED", "Could not decrypt secret", error);
        }
    }

    @ReactMethod
    public void setSecret(String name, String value, Promise promise) {
        if (!API_KEY.equals(name) || value == null || value.trim().isEmpty()) {
            promise.reject("INVALID_SECRET", "Invalid secret value");
            return;
        }
        try {
            preferences().edit().putString(API_KEY, encrypt(value.trim())).commit();
            promise.resolve(null);
        } catch (Exception error) {
            promise.reject("SECRET_WRITE_FAILED", "Could not encrypt secret", error);
        }
    }

    @ReactMethod
    public void clearSecret(String name, Promise promise) {
        if (!API_KEY.equals(name)) {
            promise.reject("UNSUPPORTED_SECRET", "Unsupported secret name");
            return;
        }
        preferences().edit().remove(API_KEY).commit();
        promise.resolve(null);
    }

    private SharedPreferences preferences() {
        return getReactApplicationContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                + ":"
                + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    private String decrypt(String stored) throws Exception {
        String[] parts = stored.split(":", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Malformed encrypted secret");
        byte[] iv = Base64.decode(parts[0], Base64.DEFAULT);
        byte[] ciphertext = Base64.decode(parts[1], Base64.DEFAULT);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }
}
