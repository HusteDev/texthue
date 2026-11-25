package com.hustedev.texthue

internal object RendererWork {
    var fits = 0
    var cusps = 0
    var hashes = 0
}

internal fun countFit() { RendererWork.fits++ }
internal fun countCusp() { RendererWork.cusps++ }
internal fun countHash() { RendererWork.hashes++ }
