import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Package, Pencil, ShoppingCart, Star, Store } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { services } from "@/services";
import type { MerchantUpdate } from "@/services";
import { useToasts } from "@/stores/toast";

export function DashboardOverviewPage() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const bannerInput = useRef<HTMLInputElement>(null);

  const merchantQ = useQuery({ queryKey: ["merchant"], queryFn: services.products.getMerchant });
  const merchant = merchantQ.data;

  const [bioOpen, setBioOpen] = useState(false);
  const [bio, setBio] = useState("");
  useEffect(() => {
    if (bioOpen && merchant) setBio(merchant.bio);
  }, [bioOpen, merchant]);

  const updateMut = useMutation({
    mutationFn: (patch: MerchantUpdate) => services.products.updateMerchant(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["merchant"] });
      push("Shop updated", "success");
    },
    onError: () => push("Couldn't save changes", "danger"),
  });

  const onBannerPick = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const bannerUrl = await services.storage.uploadImage(file, "banners");
      updateMut.mutate({ bannerUrl });
    } catch {
      push("Couldn't upload that image", "danger");
    }
  };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl">
        {/* hero: banner + avatar + shop name as the centered title */}
        {merchant ? (
          <section className="overflow-hidden rounded-card bg-card shadow-soft">
            <div className="group relative h-44 w-full bg-stone-100">
              {merchant.bannerUrl && (
                <img src={merchant.bannerUrl} alt="" className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => bannerInput.current?.click()}
                disabled={updateMut.isPending}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white backdrop-blur transition-colors hover:bg-black/70"
              >
                {updateMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="size-3.5" />
                )}
                Edit banner
              </button>
              <input
                ref={bannerInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onBannerPick(e.target.files?.[0])}
              />
            </div>

            <div className="flex flex-col items-center px-6 pb-6 text-center">
              <img
                src={merchant.avatarUrl}
                alt={merchant.name}
                className="-mt-10 size-20 rounded-full object-cover ring-4 ring-card shadow-soft"
              />
              <h1 className="mt-3 text-2xl font-extrabold text-ink">{merchant.name}</h1>
              <p className="text-sm text-muted">
                @{merchant.handle}
                {merchant.location ? ` · ${merchant.location}` : ""}
              </p>
              <Link
                to={`/${merchant.handle}`}
                target="_blank"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
              >
                <Store className="size-3.5" /> pulseshop.space/{merchant.handle}
              </Link>
            </div>
          </section>
        ) : (
          <Skeleton className="h-64 w-full rounded-card" />
        )}

        {/* quick stats */}
        {merchant && (
          <div className="mt-6 grid grid-cols-3 gap-4">
            <StatCard icon={Package} label="Products" value={merchant.stats.products} />
            <StatCard icon={ShoppingCart} label="Orders" value={merchant.stats.orders} />
            <StatCard icon={Star} label="Rating" value={merchant.stats.rating} />
          </div>
        )}

        {/* store bio */}
        {merchant && (
          <section className="mt-6 rounded-card bg-card p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-ink">Store Bio</h2>
              <Button variant="ghost" size="sm" onClick={() => setBioOpen(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink/80">
              {merchant.bio || (
                <span className="text-muted">
                  No bio yet — tell shoppers what your shop is about.
                </span>
              )}
            </p>
          </section>
        )}
      </div>

      {/* bio editor */}
      <Modal
        open={bioOpen}
        onOpenChange={setBioOpen}
        title="Edit store bio"
        description="This shows on your public storefront."
        className="max-w-lg"
      >
        <div className="space-y-4">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={280}
            placeholder="Curated fashion for every vibe ✨ Nairobi-based, countrywide delivery."
            className="w-full rounded-btn border border-stone-200 bg-card p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{bio.length}/280</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setBioOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={updateMut.isPending}
                onClick={() =>
                  updateMut.mutate(
                    { bio: bio.trim() },
                    { onSuccess: () => setBioOpen(false) },
                  )
                }
              >
                {updateMut.isPending && <Loader2 className="size-4 animate-spin" />}
                Save bio
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </DashboardShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-4 rounded-card bg-card p-5 shadow-soft">
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-extrabold text-ink">{value}</p>
        <p className="text-xs font-semibold text-muted">{label}</p>
      </div>
    </div>
  );
}
