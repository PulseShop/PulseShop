import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Facebook, Instagram, Linkedin, Music2, Twitter, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { QueryError } from "@/components/common/QueryError";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import type { SocialLinks } from "@/types";

/**
 * Platform settings. Social handles today; whatever else needs an owner-editable
 * value tomorrow.
 *
 * The links are stored in platform_settings (migration 0051) rather than in the
 * code, because a URL that changes when the marketing team opens a new account
 * should not need a deploy. The row is publicly readable — these are the links
 * printed in the marketplace footer, so they are not secrets — and writable only
 * through admin_set_setting(), which checks is_platform_admin() like everything
 * else in this room.
 *
 * A FIELD LEFT EMPTY HIDES ITS ICON. The footer renders only the networks that
 * have a URL, so an unfilled row is not a dead button on the storefront; it is
 * simply a network PulseShop is not on yet.
 */

const NETWORKS: { key: keyof SocialLinks; label: string; icon: LucideIcon; placeholder: string }[] =
  [
    { key: "facebook", label: "Facebook", icon: Facebook, placeholder: "https://facebook.com/…" },
    { key: "x", label: "X", icon: Twitter, placeholder: "https://x.com/…" },
    { key: "tiktok", label: "TikTok", icon: Music2, placeholder: "https://tiktok.com/@…" },
    { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/…" },
    { key: "linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "https://linkedin.com/company/…" },
    { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/@…" },
  ];

const EMPTY: SocialLinks = {
  facebook: "",
  x: "",
  tiktok: "",
  instagram: "",
  linkedin: "",
  youtube: "",
};

export function SettingsPanel() {
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);

  const linksQ = useQuery({
    queryKey: ["social-links"],
    queryFn: () => services.admin.getSocialLinks(),
  });

  const [draft, setDraft] = useState<SocialLinks | null>(null);
  // Seed the form the first time the stored values arrive, and never again:
  // re-seeding on refetch would wipe whatever the owner is halfway through
  // typing.
  const [seeded, setSeeded] = useState(false);
  if (!seeded && linksQ.data) {
    setSeeded(true);
    setDraft(linksQ.data);
  }

  const values = draft ?? EMPTY;

  const save = useMutation({
    mutationFn: () => services.admin.setSocialLinks(values),
    onSuccess: () => {
      push("Social links saved", "success");
      queryClient.invalidateQueries({ queryKey: ["social-links"] });
    },
    onError: (err: Error) => push(err.message || "Could not save the links", "danger"),
  });

  const filled = NETWORKS.filter((n) => values[n.key].trim() !== "").length;

  return (
    <div className="space-y-4">
      <section className="rounded-card bg-card p-5 shadow-soft">
        <h2 className="text-sm font-bold text-ink">Social links</h2>
        <p className="mt-0.5 text-xs text-muted">
          Printed in the marketplace footer. An empty field hides that icon rather than shipping a
          dead button, so it is safe to fill these in one at a time.
        </p>

        {linksQ.isError ? (
          <div className="mt-4">
            <QueryError title="Couldn't load the links" onRetry={() => linksQ.refetch()} />
          </div>
        ) : linksQ.isLoading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              {NETWORKS.map(({ key, label, icon: Icon, placeholder }) => (
                <div key={key} className="flex items-center gap-2.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line text-muted">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <input
                    type="url"
                    inputMode="url"
                    value={values[key]}
                    onChange={(e) => setDraft({ ...values, [key]: e.target.value })}
                    aria-label={`${label} URL`}
                    placeholder={placeholder}
                    className="h-11 min-w-0 flex-1 rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                {filled} of {NETWORKS.length} set — the footer shows only these.
              </p>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : "Save links"}
              </Button>
            </div>
          </>
        )}
      </section>

      {/*
        A standing note rather than a metric. The dashboard mock-ups this room
        was modelled on lead with page views, visitors and clicks; PulseShop
        collects none of those in its own database. They exist in Cloudflare Web
        Analytics and Vercel Analytics, neither of which the app can query
        without server-side API tokens. Showing the tiles with invented numbers
        would be worse than not showing them, so they are absent and this says
        why — otherwise the next person to open this page will assume it is a
        bug and go looking for the query.
      */}
      <section className="rounded-card border border-line bg-card p-5">
        <h2 className="text-sm font-bold text-ink">Traffic analytics</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Page views, visitors and click-through are not shown anywhere in this room because
          PulseShop does not record them. They live in Cloudflare Web Analytics and Vercel
          Analytics, which need a server-side API token to query. Wiring one of those up is the
          job; inventing the numbers here is not.
        </p>
      </section>
    </div>
  );
}
