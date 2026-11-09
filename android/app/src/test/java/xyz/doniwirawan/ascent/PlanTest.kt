package xyz.doniwirawan.ascent

import org.junit.Assert.assertEquals
import org.junit.Test

/** Plan compliance colours match the website's plCompliance. */
class PlanTest {
    private val t = "2026-11-09"
    @Test fun compliance() {
        assertEquals("green", Plan.compliance(100.0, 100.0, "2026-11-08", t))
        assertEquals("yellow", Plan.compliance(100.0, 60.0, "2026-11-08", t))
        assertEquals("orange", Plan.compliance(100.0, 20.0, "2026-11-08", t))
        assertEquals("red", Plan.compliance(100.0, 0.0, "2026-11-08", t))
        assertEquals("future", Plan.compliance(100.0, 0.0, t, t))
        assertEquals("green", Plan.compliance(100.0, 95.0, t, t))
        assertEquals("extra", Plan.compliance(0.0, 50.0, "2026-11-08", t))
    }
}
