#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Read-only SQLite boundary used by the JavaScript migration preflight.
 *
 * This module intentionally exposes no WatermelonDB adapter and no write
 * operation. It is a source inspection boundary, not a migration writer.
 */
@interface ZeroReadOnlySqlite : NSObject <RCTBridgeModule>
@end

NS_ASSUME_NONNULL_END
