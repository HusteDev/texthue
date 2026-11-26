package com.hustedev.texthue

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RendererBehaviorTest {
    @Test fun retainedLabelsKeepTheirPlacementsAndColors() {
        val resolver = Resolver()
        val original = resolver.assign(listOf("research", "design", "engineering"))
        val extended = resolver.assign(listOf("research", "ops"), pinned = original.assignments)
        assertEquals(original.colors["research"], extended.colors["research"])
        for ((label, pin) in original.assignments) assertEquals(pin, extended.assignments[label])
        assertNotEquals(original.colors["research"], original.colors["design"])
    }

    @Test fun invalidInputHasAStableCode() {
        val resolver = Resolver()
        val failure = assertThrows(TextColorException::class.java) { resolver.hex("\uD800") }
        assertEquals("INVALID_TEXT", failure.code)
        val option = assertThrows(TextColorException::class.java) { resolver.hex("label", role = "unknown") }
        assertEquals("INVALID_OPTIONS", option.code)
    }
}
