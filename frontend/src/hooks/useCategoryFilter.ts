import { useMemo, useState } from "react";
import { groupCategories, groupItems, UNGROUPED } from "@/lib/constants";

/** Every group is selected as "All" until the shopper picks one. */
export const ALL_GROUPS = "All";

/**
 * The two-level category filter, shared by the marketplace ribbon and each
 * shop's own storefront.
 *
 * WHY A HOOK AND NOT TWO COPIES. The marketplace and the storefront ask the
 * same question of the same facets RPC and draw it with different furniture —
 * a chip rail on one, a sidebar list on the other. The rules underneath are
 * identical and fiddly (an empty subcategory set means the WHOLE group, groups
 * disappear as stock runs out, a stale selection must not survive the facets
 * that justified it), so they live once, here, and the two pages differ only in
 * how they paint them.
 *
 * THE SELECTION IS A GROUP PLUS A SUBSET OF ITS LEAVES. `group` is the general
 * ("Beauty & Health"); `subs` is however much of it the shopper narrowed to
 * ("Hair Care", "Cosmetics"). An EMPTY `subs` is not "nothing selected", it is
 * "all of this group" — which is what makes the first tap useful on its own,
 * before any second-level decision has been made.
 *
 * WHAT THE QUERY GETS is always a flat list of leaves (`queryCategories`),
 * because that is the only thing `products.category` can be compared against.
 * The group level never reaches the database; see migration 0059.
 */
export function useCategoryFilter(inUse: readonly string[]) {
  const [group, setGroupRaw] = useState<string>(ALL_GROUPS);
  const [subs, setSubs] = useState<string[]>([]);

  /** The groups this catalogue can actually offer, in merchandising order. */
  const tree = useMemo(() => groupCategories(inUse), [inUse]);

  /**
   * A selection can outlive the stock that justified it — the last item in a
   * group sells out, the shopper switches shops, the facets refetch. Rather
   * than let the grid go permanently empty behind a chip that is no longer on
   * screen, the live selection is derived from what the tree still holds.
   */
  const activeGroup = tree.some((g) => g.group === group) ? group : ALL_GROUPS;
  const groupLeaves = useMemo(
    () => tree.find((g) => g.group === activeGroup)?.items ?? [],
    [tree, activeGroup],
  );
  const activeSubs = useMemo(
    () => subs.filter((s) => groupLeaves.includes(s)),
    [subs, groupLeaves],
  );

  /** Picking a different general throws away the specifics of the last one. */
  const setGroup = (next: string) => {
    setGroupRaw(next);
    setSubs([]);
  };

  const toggleSub = (leaf: string) =>
    setSubs((list) => (list.includes(leaf) ? list.filter((v) => v !== leaf) : [...list, leaf]));

  const reset = () => {
    setGroupRaw(ALL_GROUPS);
    setSubs([]);
  };

  /**
   * The leaves to filter on: the narrowed set if there is one, otherwise every
   * leaf in the group. Undefined — not an empty array — for "no constraint", so
   * an unfiltered call sends nothing at all and stays byte-identical to the
   * query this page made before the ribbon had two levels.
   */
  const queryCategories: string[] | undefined =
    activeGroup === ALL_GROUPS
      ? undefined
      : activeSubs.length > 0
        ? activeSubs
        : // `groupLeaves` rather than the taxonomy's full item list: filtering
          // to categories nothing is filed under would be a query guaranteed to
          // return the same rows, just longer. UNGROUPED has no taxonomy entry
          // at all, so its leaves only exist here.
          groupLeaves.length > 0
          ? [...groupLeaves]
          : [...groupItems(activeGroup)];

  /** One for the general, one for each specific — matching the chips shown. */
  const activeCount = (activeGroup === ALL_GROUPS ? 0 : 1) + activeSubs.length;

  return {
    tree,
    group: activeGroup,
    setGroup,
    subs: activeSubs,
    toggleSub,
    /** The leaves under the chosen group, for drawing the second level. */
    groupLeaves,
    queryCategories,
    activeCount,
    reset,
    isUngrouped: activeGroup === UNGROUPED,
  };
}
