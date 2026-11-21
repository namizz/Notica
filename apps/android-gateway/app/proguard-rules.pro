# Room
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**

# Kotlinx Serialization
-keepattributes *Annotation*,InnerClasses
-dontnote kotlinx.serialization.SerializationKt
-keepclassmembers class * {
    *** Companion;
}
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}

# Socket.io & Engine.io
-keep class io.socket.** { *; }
-keep class io.socket.client.** { *; }
-keep class io.socket.emitter.** { *; }
-keep class io.socket.engineio.client.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
