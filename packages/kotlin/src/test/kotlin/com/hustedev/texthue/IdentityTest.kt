package com.hustedev.texthue

import java.util.Base64

// Input rows come from the shared conformance corpus; Base64 preserves empty
// strings, control characters and supplementary code points across shells.
@Suppress("DestructuringDeclarationWithTooManyEntries") // Named columns of the conformance fixture.
fun main() {
    val decode = Base64.getDecoder()
    val count = generateSequence(::readlnOrNull).map { line ->
        val (text, namespace, seed, hash, fractions) = line.split('\t')
        val actual = Identity.digest(
            decode.decode(text).toString(Charsets.UTF_8),
            decode.decode(namespace).toString(Charsets.UTF_8),
            seed.toUInt()
        )
        check(actual.joinToString("") { "%02x".format(it) } == hash)
        check(Identity.fractions(actual).contentEquals(fractions.split(',').map(String::toDouble).toDoubleArray()))
    }.count()
    check(count > 0)
    check(runCatching { Identity.digest("\uD800") }.exceptionOrNull() is IllegalArgumentException)
    check(runCatching { Identity.digest("", "\uDC00") }.exceptionOrNull() is IllegalArgumentException)
    println("Passed $count shared identity vectors and malformed UTF-16 checks")
}
