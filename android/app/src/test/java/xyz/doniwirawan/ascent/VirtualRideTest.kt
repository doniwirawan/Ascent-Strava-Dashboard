package xyz.doniwirawan.ascent

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Zwift / MyWhoosh rides: counted as rides, kept out of speed comparisons. */
class VirtualRideTest {
    private fun act(type: String, kmh: Double, extra: String = "") =
        JSONObject("""{"type":"$type","sport_type":"$type","average_speed":${kmh / 3.6},"moving_time":3600$extra}""")

    @Test fun detectsVirtualRides() {
        assertTrue(Screens.isVirtual(act("VirtualRide", 38.0)))
        assertTrue(Screens.isVirtual(act("Ride", 30.0, ""","trainer":true""")))
        assertTrue(Screens.isVirtual(act("Ride", 30.0, ""","virtual":true""")))
        assertFalse(Screens.isVirtual(act("Ride", 30.0)))
        assertFalse(Screens.isVirtual(act("Run", 12.0, ""","trainer":true""")))   // treadmill pace is real
        assertTrue(Screens.isRide(act("VirtualRide", 38.0)))
    }

    @Test fun speedZonesSkipVirtual() {
        val out = Screens.speedZoneTotals(listOf(act("VirtualRide", 45.0), act("Ride", 45.0)))
        val only = Screens.speedZoneTotals(listOf(act("Ride", 45.0)))
        assertArrayEquals(only, out, 1e-9)
    }
}
