/**
 * How many bought slots the hero keeps before the rest go to the sponsored
 * panel beside it.
 *
 * THREE, which at a twelve-second dwell is a thirty-six-second round trip — the
 * outer limit of a rotation a shopper will actually see the end of. 0049
 * replaced a ranked strip with a rotation precisely so that the last slot was
 * worth the same as the first; a queue long enough that nobody reaches the back
 * of it quietly undoes that. The fix is a second unit, not a longer queue.
 *
 * Nobody appears in both. An advert shown twice on one screen is not two
 * impressions, it is one impression and a shopper who has learned to ignore the
 * smaller panel.
 *
 * IT LIVES HERE RATHER THAN IN THE MARKETPLACE because it is not only a layout
 * number any more: the Control Room draws the booked list as two groups either
 * side of exactly this cut, and lets the owner move an ad across it. If the
 * front page and the panel that fills it disagreed about where the boundary is,
 * the owner would be sorting one list and watching a different one change.
 */
export const HERO_SLOTS = 3;
