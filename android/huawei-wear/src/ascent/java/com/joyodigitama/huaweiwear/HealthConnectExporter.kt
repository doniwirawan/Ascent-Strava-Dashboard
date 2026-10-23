package com.joyodigitama.huaweiwear

import android.content.Context
import kotlinx.coroutines.CoroutineScope

/**
 * Ascent's stand-in for JoyoFit's HealthConnectExporter: Ascent doesn't copy the watch's data into
 * Health Connect (it reads joyofit.db itself and uploads sleep to the dashboard), so both hooks
 * WearRuntime calls do nothing.
 */
@Suppress("UNUSED_PARAMETER")
internal class HealthConnectExporter(context: Context, syncStore: SyncStore, events: WearEvents, scope: CoroutineScope) {
  fun onSyncComplete(summary: SyncSummary) {}
  fun repairSleepIfDue() {}
}
