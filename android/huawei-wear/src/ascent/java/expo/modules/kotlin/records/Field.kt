package expo.modules.kotlin.records

/** Stand-in for Expo's field annotation (it only mattered for JS conversion). */
@Target(AnnotationTarget.FIELD, AnnotationTarget.PROPERTY)
@Retention(AnnotationRetention.RUNTIME)
annotation class Field
