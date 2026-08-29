# R8 rules for the Capacitor shell. The actual app is the web bundle in
# assets/public — R8 never touches it. These keeps cover the native bridge's
# reflection points; everything else (androidx, Firebase, kotlin runtime)
# obfuscates and shrinks freely, which is what Play's "App optimization"
# check wants to see.

# ── Capacitor core + plugin bridge ──
# Plugin classes and their @PluginMethod / callback methods are looked up
# reflectively by name at runtime.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }

# ── Cordova compatibility layer (capacitor-cordova-android-plugins) ──
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin { *; }

# ── WebView ↔ JS bridge ──
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keepattributes *Annotation*

# ── Background Runner (own JS runtime; resolves classes reflectively) ──
-keep class io.ionic.android.** { *; }
-keep class io.ionic.backgroundrunner.** { *; }

# Readable crash reports from testers: keep line numbers, hide file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
