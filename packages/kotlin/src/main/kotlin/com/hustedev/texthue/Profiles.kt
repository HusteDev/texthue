package com.hustedev.texthue

data class UnitRange(val low: Double, val high: Double) {
    init { require(low in 0.0..1.0 && high in low..1.0) }
    internal fun sample(fraction: Double) = low + (high - low) * fraction
}

data class RoleProfile(
    val lightness: UnitRange? = null,
    val chromaScale: UnitRange? = null,
    val chromaCap: Double? = null,
) {
    init { require(chromaCap == null || chromaCap in 0.0..0.4) }
}

data class ThemeProfiles(val fill: RoleProfile = RoleProfile(), val text: RoleProfile = RoleProfile())
data class Profiles(val light: ThemeProfiles = ThemeProfiles(), val dark: ThemeProfiles = ThemeProfiles())
