package com.hustedev.texthue

import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CharacterCodingException
import java.security.MessageDigest

internal object Identity {
    private val prefix = "text-to-color-v1\u0000".toByteArray(Charsets.UTF_8)

    private fun utf8(value: String, field: String): ByteBuffer {
        try {
            return Charsets.UTF_8.newEncoder().encode(CharBuffer.wrap(value))
        } catch (error: CharacterCodingException) {
            val code = if (field == "text") "INVALID_TEXT" else "INVALID_OPTIONS"
            throw TextColorException(code, "Unpaired surrogate in $field", error)
        }
    }

    fun digest(text: String, namespace: String = "", seed: UInt = 0u): ByteArray {
        countHash()
        val scope = utf8(namespace, "namespace")
        val header = ByteBuffer.allocate(8).putInt(seed.toInt()).putInt(scope.remaining())
        return MessageDigest.getInstance("SHA-256").apply {
            update(prefix)
            update(header.array())
            update(scope)
            update(utf8(text, "text"))
        }.digest()
    }

    fun fractions(digest: ByteArray): DoubleArray {
        val words = ByteBuffer.wrap(digest)
        return DoubleArray(3) { words.int.toUInt().toDouble() / 4294967296.0 }
    }
}
