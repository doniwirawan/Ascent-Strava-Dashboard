package xyz.doniwirawan.ascent

/** More → Help: the website's "Help & Data" — what the metrics mean, where things are in the app, and where the data comes from. */
object Help {
    private val METRICS = listOf(
        "Eddington number (E)" to "The largest E where you've ridden at least E km on E separate days. E = 70 means 70 rides of 70 km or more. A tough, cumulative measure of consistent big days.",
        "Fitness, fatigue, form (CTL / ATL / TSB)" to "Fitness is your 42-day training load, fatigue your 7-day load, form = fitness − fatigue (positive = fresh). Ramp is how fast fitness changes per week. Load comes from power, else Strava Relative Effort, else heart rate, else duration.",
        "Consistency" to "How many of the last 12 weeks you hit 3 rides; partial weeks count partly.",
        "Streak" to "Your longest run of consecutive days with at least one activity.",
        "Moving vs elapsed time" to "Moving time leaves out pauses and stops; elapsed time is the full clock. Stats here use moving time.",
        "Average / max speed" to "The average and peak speed Strava recorded, in km/h. Tops over 65 km/h are GPS glitches — More → GPS check fixes them.",
        "Pace" to "Minutes per km for runs and walks, per 100 m for swims.",
        "Cadence" to "Pedalling rate in rpm for rides, steps per minute for runs.",
        "Elevation gain" to "Total metres climbed — the sum of every uphill part.",
        "Normalized power (NP)" to "For power-meter rides: a weighted average that reflects the cost of changing efforts better than a plain average.",
        "FTP" to "Functional threshold power: from your Strava profile, else 95% of your best 20-minute+ normalized power. Climbing power estimates it without a power meter.",
        "IF, TSS, VI" to "Intensity factor = NP ÷ FTP. Training stress score: 100 ≈ an hour at FTP. Variability index = NP ÷ average power (1.00 = perfectly steady).",
        "W/kg" to "Watts per kilogram of body weight (from your Strava profile).",
        "CP and W′" to "Critical power is the power you can hold for a long time; W′ is the reserve above it. W′ balance shows how much of that reserve each effort used.",
        "Efficiency factor" to "Normalized power (or speed) per heartbeat. Rising means fitter at the same effort.",
        "Heart-rate decoupling" to "Output per heartbeat in the first half of a long ride against the second. Under 5% is well-coupled; over 10% means the second half faded.",
        "VAM" to "Velocità Ascensionale Media — vertical metres climbed per hour. Elite climbs are about 1,600 m/h and up.",
        "Relative Effort" to "Strava's measure of how hard a session was, from time in heart-rate zones.",
        "Energy (kJ)" to "Work done on the pedals, from power. Roughly equal to the calories you burned.",
        "KOM / QOM / CR" to "Fastest-ever on a segment. A PR is your own fastest time.",
        "Sleep efficiency" to "Time asleep ÷ time in bed. A night is dated by the morning you woke up.",
    )
    private val PLACES = listOf(
        "Home" to "Recovery, last 7 days, fitness & form, calendar, this year, all time, by sport, heart-rate and speed zones, insights, Eddington, bikes.",
        "Rides" to "Every activity with search and the routes map; Runs / Walks / Swims / Other chips open that sport's page; Only on Huawei at the bottom.",
        "Ride page" to "Charts, zones, splits, W′ balance, decoupling, where the time went, wind, segments & PRs, AI analysis, Story card.",
        "Power" to "FTP, power-meter rides, power curve and CP, insights, weekly power, efficiency, intensity mix, records, cadence, climbing power, zones.",
        "Sleep" to "Watch link, Health Connect, nights, what your sleep says, the night after training, weekday, spread, trends.",
        "More" to "Money (spending, bikes, cost per km, bike comparison, bike care), Trends, Calendar, Training, Milestones, Destinations, Data, GPS check, Segments, Segment gaps, Photos, Chase routes, Help.",
    )
    private val DATA = listOf(
        "Where it comes from" to "Your own dashboard's Personal API (/api/v1) with your asc_ token: Strava activities cached by the website, Strava live for streams, segments and photos, sleep from the Huawei export and the watch, purchases from the finance app.",
        "What stays on the phone" to "A copy of every API answer (so pages open instantly), streams the app analysed, photos you looked at, chase routes, bike-care dates and GPS fixes.",
        "AI" to "AI features use your own key (AI → Settings) and talk to that provider directly. They see page numbers, requests and place names — never where your rides start.",
        "Strava's limit" to "Streams, segments and photos come live from Strava, whose request limit the website shares; the app reads them once and keeps them.",
    )

    fun page(a: AppActivity) {
        val col = a.page()
        More.back(a, col, "Help")
        fun section(title: String, rows: List<Pair<String, String>>) {
            col.addView(Ui.heading(a, title))
            col.addView(Ui.card(a).apply { rows.forEachIndexed { i, (k, v) -> if (i > 0) addView(Ui.divider(a)); addView(Ui.text(a, k, 14f, Ui.TEXT, true)); addView(Ui.text(a, v, 12f, Ui.MUTED)) } })
        }
        section("What the metrics mean", METRICS)
        section("Where things are", PLACES)
        section("Your data", DATA)
    }
}
