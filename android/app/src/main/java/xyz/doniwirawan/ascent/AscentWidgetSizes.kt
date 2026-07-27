package xyz.doniwirawan.ascent

/**
 * The other two sizes. They inherit every behaviour from [AscentWidget] and
 * differ only in the layout they inflate — refreshing any one of them redraws
 * all three, since they all read the same cached snapshot.
 */

/** 2x2 — a single large Recovery ring. Tapping opens the native screen. */
class AscentWidgetSmall : AscentWidget() {
    override val layout: Int get() = R.layout.widget_small
}

/** 4x4 — everything, plus the name of the latest activity. */
class AscentWidgetLarge : AscentWidget() {
    override val layout: Int get() = R.layout.widget_large
}
