package com.anotherwhy.zero

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage
import com.anotherwhy.zero.readonly.ReadOnlySqlitePackage
import com.anotherwhy.zero.secure.SecureSecretPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(ReadOnlySqlitePackage())
          add(SecureSecretPackage())
          // WatermelonDB's bridge package is autolinked, but its optional JSI
          // installer package is not. Register it explicitly so SQLiteAdapter
          // can use the UI/runtime JSI path on the approved RN 0.87 stack.
          add(WatermelonDBJSIPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
