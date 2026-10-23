package expo.modules.kotlin.exception

/** Stand-in for Expo's exception with an error code (the codes are WearTypes.kt's ErrorCodes). */
open class CodedException(val code: String, message: String?, cause: Throwable? = null) : Exception(message, cause)
