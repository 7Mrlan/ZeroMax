#import "ZeroSecureSecrets.h"

#import <Security/Security.h>

static NSString *const ZeroSecureSecretsErrorDomain = @"ZeroSecureSecrets";
static NSString *const ZeroSecureSecretsService = @"com.anotherwhy.zero.secure-secrets";
static NSString *const ZeroSecureSecretsApiKeyName = @"ai_api_key";
static NSUInteger const ZeroSecureSecretsMaximumBytes = 8192;

@implementation ZeroSecureSecrets

RCT_EXPORT_MODULE(ZeroSecureSecrets)

+ (dispatch_queue_t)methodQueue {
  static dispatch_queue_t queue;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    queue = dispatch_queue_create("com.anotherwhy.zero.secure-secrets", DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

RCT_EXPORT_METHOD(getSecret:(NSString *)name
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (![self isAllowedSecretName:name]) {
    reject(@"UNSUPPORTED_SECRET", @"Unsupported secret name", nil);
    return;
  }

  NSMutableDictionary *query = [[self queryForName:name] mutableCopy];
  query[(__bridge id)kSecReturnData] = @YES;
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;

  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
  if (status == errSecItemNotFound) {
    resolve((id)kCFNull);
    return;
  }
  if (status != errSecSuccess || result == NULL) {
    NSError *error = [self keychainError:status description:@"Could not read secure secret"];
    reject(@"SECRET_READ_FAILED", error.localizedDescription, error);
    if (result != NULL) {
      CFRelease(result);
    }
    return;
  }

  if (CFGetTypeID(result) != CFDataGetTypeID()) {
    CFRelease(result);
    NSError *error = [self errorWithCode:2 description:@"Stored secure secret has an invalid Keychain type"];
    reject(@"SECRET_READ_FAILED", error.localizedDescription, error);
    return;
  }
  NSData *data = CFBridgingRelease(result);
  NSString *value = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (value == nil || value.length == 0) {
    NSError *error = [self errorWithCode:1 description:@"Stored secure secret is not valid UTF-8"];
    reject(@"SECRET_READ_FAILED", error.localizedDescription, error);
    return;
  }
  resolve(value);
}

RCT_EXPORT_METHOD(setSecret:(NSString *)name
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (![self isAllowedSecretName:name]) {
    reject(@"UNSUPPORTED_SECRET", @"Unsupported secret name", nil);
    return;
  }

  NSString *trimmedValue = [value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  NSData *data = [trimmedValue dataUsingEncoding:NSUTF8StringEncoding];
  if (data == nil || trimmedValue.length == 0 || data.length > ZeroSecureSecretsMaximumBytes) {
    reject(@"INVALID_SECRET", @"Invalid secret value", nil);
    return;
  }

  NSDictionary *query = [self queryForName:name];
  NSDictionary *attributes = @{(__bridge id)kSecValueData: data};
  OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)attributes);
  if (status == errSecItemNotFound) {
    NSMutableDictionary *addQuery = [query mutableCopy];
    addQuery[(__bridge id)kSecValueData] = data;
    addQuery[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
    status = SecItemAdd((__bridge CFDictionaryRef)addQuery, NULL);
  }

  if (status != errSecSuccess) {
    NSError *error = [self keychainError:status description:@"Could not save secure secret"];
    reject(@"SECRET_WRITE_FAILED", error.localizedDescription, error);
    return;
  }
  resolve((id)kCFNull);
}

RCT_EXPORT_METHOD(clearSecret:(NSString *)name
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (![self isAllowedSecretName:name]) {
    reject(@"UNSUPPORTED_SECRET", @"Unsupported secret name", nil);
    return;
  }

  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)[self queryForName:name]);
  if (status != errSecSuccess && status != errSecItemNotFound) {
    NSError *error = [self keychainError:status description:@"Could not clear secure secret"];
    reject(@"SECRET_CLEAR_FAILED", error.localizedDescription, error);
    return;
  }
  resolve((id)kCFNull);
}

- (BOOL)isAllowedSecretName:(NSString *)name {
  return [name isEqualToString:ZeroSecureSecretsApiKeyName];
}

- (NSDictionary *)queryForName:(NSString *)name {
  return @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: ZeroSecureSecretsService,
    (__bridge id)kSecAttrAccount: name,
  };
}

- (NSError *)errorWithCode:(NSInteger)code description:(NSString *)description {
  return [NSError errorWithDomain:ZeroSecureSecretsErrorDomain
                              code:code
                          userInfo:@{NSLocalizedDescriptionKey: description}];
}

- (NSError *)keychainError:(OSStatus)status description:(NSString *)description {
  NSString *message = [NSString stringWithFormat:@"%@ (status %d)", description, (int)status];
  return [self errorWithCode:status description:message];
}

@end
