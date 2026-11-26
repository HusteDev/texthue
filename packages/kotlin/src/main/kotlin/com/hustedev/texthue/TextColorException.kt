package com.hustedev.texthue

/** Stable codes shared with the other TextHue implementations. */
interface TextHueError { val code: String }

class TextColorException internal constructor(
    override val code: String, message: String, cause: Throwable? = null
) : IllegalArgumentException(message, cause), TextHueError

class UnmetConstraintException internal constructor(relationship: String) :
    IllegalStateException("Contrast target for $relationship was not met"), TextHueError {
    override val code: String = "UNMET_CONSTRAINT"
}

internal inline fun requireOption(condition: Boolean, message: () -> String = { "Invalid renderer option" }) {
    if (!condition) throw TextColorException("INVALID_OPTIONS", message())
}
