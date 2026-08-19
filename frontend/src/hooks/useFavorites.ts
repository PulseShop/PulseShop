import { useEffect, useRef } from "react";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useBrowsingHistory } from "@/stores/browsingHistory";
import { useFavorites } from "@/stores/favorites";
import { useToasts } from "@/stores/toast";

/**
 * Cross-device sync for favorites, plus the shared-device safety clear.
 *
 * On sign-in: pulls the signed-in user's favorites from the server (DB
 * `favorites` table, RLS owner-only) into the local (device) store, and pushes
 * up any local-only ids (saved as a guest just before logging in, or offline)
 * so a guest's favorites aren't lost when they log in. This is what makes
 * favorites follow the ACCOUNT to a new device instead of living only in this
 * browser's localStorage.
 *
 * On sign-out: clears the local favorites, because the store persists under a
 * fixed localStorage key and favorites are personal — without this, the next
 * person on a shared device would see the previous account's favorites (the
 * same leak class the cart and order history had).
 *
 * Mount once near the app root (see AppSync in main.tsx).
 */
export function useFavoritesSync() {
  const userId = useAuth((s) => s.session?.id ?? null);
  const syncedFor = useRef<string | null>(null);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!userId) {
      if (wasSignedIn.current) {
        useFavorites.getState().clear();
        // Browsing history rides along for the same reason: it is a record of
        // what a person looked at, kept under a fixed localStorage key, and the
        // next person on a shared phone must not inherit it.
        useBrowsingHistory.getState().clear();
      }
      wasSignedIn.current = false;
      syncedFor.current = null;
      return;
    }
    wasSignedIn.current = true;
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;

    (async () => {
      try {
        const remoteIds = await services.favorites.listFavorites();
        const { favorites, toggle } = useFavorites.getState();
        const localIds = new Set(favorites.map((f) => f.productId));

        for (const id of remoteIds) if (!localIds.has(id)) toggle(id);

        const remoteSet = new Set(remoteIds);
        await Promise.all(
          [...localIds]
            .filter((id) => !remoteSet.has(id))
            .map((id) => services.favorites.addFavorite(id).catch(() => {})),
        );
      } catch {
        // best-effort — local favorites still work offline
      }
    })();
  }, [userId]);
}

/** Toggles a favorite locally (instant) and mirrors the change to the server when signed in. */
export function useFavoriteToggle() {
  const toggle = useFavorites((s) => s.toggle);
  const isFavorite = useFavorites((s) => s.isFavorite);
  const userId = useAuth((s) => s.session?.id ?? null);
  const push = useToasts((s) => s.push);

  return (productId: string) => {
    const wasFavorite = isFavorite(productId);
    toggle(productId);
    if (!userId) return;
    const call = wasFavorite
      ? services.favorites.removeFavorite(productId)
      : services.favorites.addFavorite(productId);
    call.catch(() => push("Couldn't sync favorite — it's still saved on this device", "danger"));
  };
}
