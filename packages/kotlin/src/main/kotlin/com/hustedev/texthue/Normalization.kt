package com.hustedev.texthue

import java.text.Normalizer
import java.util.Locale

enum class UnicodeForm { NONE, NFC, NFKC }
enum class TextCase { NONE, LOWER }
enum class Whitespace { NONE, TRIM, COLLAPSE }

data class Normalization(
    val unicode: UnicodeForm = UnicodeForm.NONE,
    val casing: TextCase = TextCase.NONE,
    val whitespace: Whitespace = Whitespace.NONE,
) {
    internal fun apply(input: String): String {
        val normalized = when (unicode) {
            UnicodeForm.NONE -> input
            UnicodeForm.NFC -> Normalizer.normalize(input, Normalizer.Form.NFC)
            UnicodeForm.NFKC -> Normalizer.normalize(input, Normalizer.Form.NFKC)
        }
        val text = if (casing == TextCase.LOWER) normalized.lowercase(Locale.ROOT) else normalized
        if (whitespace == Whitespace.NONE) return text
        val trimmed = edges.replace(text, "")
        return if (whitespace == Whitespace.COLLAPSE) runs.replace(trimmed, " ") else trimmed
    }

    private companion object {
        val edges = Regex("^\\p{IsWhite_Space}+|\\p{IsWhite_Space}+\\z")
        val runs = Regex("\\p{IsWhite_Space}+")
    }
}
