import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, LogOut, Mail } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { CharCount, SeoPreviews } from "@/components/seo/SeoPanel";
import { shopSeo } from "@/lib/seo";
import { seoShopFrom } from "@/lib/seoFrom";
import { Skeleton } from "@/components/ui/Skeleton";
import { services } from "@/services";
import type { MerchantUpdate } from "@/services";
import { slugError, slugify } from "@/lib/slug";
import { isUniqueViolation } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";

export function SettingsPage() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const navigate = useNavigate();
  const session = useAuth((s) => s.session);
  const setSession = useAuth((s) => s.setSession);
  const signOut = useAuth((s) => s.signOut);
  const avatarInput = useRef<HTMLInputElement>(null);

  const merchantQ = useQuery({ queryKey: ["merchant"], queryFn: services.products.getMerchant });
  const merchant = merchantQ.data;

  // profile form state, seeded once the merchant loads
  const [form, setForm] = useState({
    name: "",
    handle: "",
    location: "",
    whatsapp: "",
    instagram: "",
    facebook: "",
    tagline: "",
    metaDescription: "",
  });
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!merchant) return;
    setForm({
      name: merchant.name,
      handle: merchant.handle,
      location: merchant.location,
      whatsapp: merchant.contacts.whatsapp,
      instagram: merchant.contacts.instagram,
      facebook: merchant.contacts.facebook,
      tagline: merchant.tagline,
      metaDescription: merchant.metaDescription,
    });
  }, [merchant]);

  useEffect(() => {
    if (session) setEmail(session.email);
  }, [session]);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  /**
   * The previews run the seller's unsaved edits through the SAME builders the
   * server uses, so what they see here is literally what a crawler will get —
   * not an approximation of it. That is the whole value of the panel: without
   * it these two fields are invisible until someone happens to search for the
   * shop.
   */
  const seoPreview = useMemo(
    () =>
      merchant
        ? shopSeo(
            seoShopFrom({
              ...merchant,
              name: form.name || merchant.name,
              handle: form.handle || merchant.handle,
              location: form.location,
              tagline: form.tagline,
              metaDescription: form.metaDescription,
            }),
            typeof window === "undefined" ? "https://pulseshop.space" : window.location.origin,
          )
        : null,
    [merchant, form.name, form.handle, form.location, form.tagline, form.metaDescription],
  );

  const handleIssue = slugError(form.handle);

  const updateMut = useMutation({
    mutationFn: (patch: MerchantUpdate) => services.products.updateMerchant(patch),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["merchant"] });
      // keep the session's shop name/slug in sync with the profile
      if (session) setSession({ ...session, shopName: updated.name, shopSlug: updated.handle });
      push("Profile saved", "success");
    },
    onError: (err) => {
      if (isUniqueViolation(err)) {
        push("That username is already taken — try another one", "danger");
      } else {
        push("Couldn't save profile", "danger");
      }
    },
  });

  const emailMut = useMutation({
    mutationFn: (next: string) => services.auth.updateEmail(next),
    onSuccess: () => {
      if (session) setSession({ ...session, email });
      push("Email updated — check your inbox if confirmation is required", "success");
    },
    onError: () => push("Couldn't update email", "danger"),
  });

  const onAvatarPick = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const prevUrl = merchant?.avatarUrl;
    try {
      const avatarUrl = await services.storage.uploadImage(file, "avatars");
      updateMut.mutate({ avatarUrl });
      if (prevUrl) services.storage.deleteImage(prevUrl).catch(() => {});
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't upload that image", "danger");
    }
  };

  const saveProfile = () => {
    if (handleIssue) {
      push(handleIssue, "danger");
      return;
    }
    updateMut.mutate({
      name: form.name.trim(),
      handle: slugify(form.handle),
      location: form.location.trim(),
      whatsapp: form.whatsapp.trim(),
      instagram: form.instagram.trim(),
      facebook: form.facebook.trim(),
      tagline: form.tagline,
      metaDescription: form.metaDescription,
    });
  };

  const handleSignOut = async () => {
    try {
      await services.auth.logout();
    } finally {
      signOut();
      navigate("/");
    }
  };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted">Dashboard / Settings</p>
          <h1 className="text-2xl font-extrabold text-ink">Account Settings</h1>
        </div>

        {!merchant ? (
          <Skeleton className="h-96 w-full rounded-card" />
        ) : (
          <div className="space-y-6">
            {/* profile */}
            <section className="rounded-card bg-card p-6 shadow-soft">
              <h2 className="text-lg font-extrabold text-ink">Profile</h2>
              <div className="mt-4 flex items-center gap-4">
                <img
                  src={merchant.avatarUrl}
                  alt={merchant.name}
                  className="size-16 rounded-full object-cover ring-2 ring-stone-100"
                />
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => avatarInput.current?.click()}
                    disabled={updateMut.isPending}
                  >
                    <ImagePlus className="size-4" /> Change photo
                  </Button>
                  <p className="mt-1 text-xs text-muted">PNG or JPG.</p>
                </div>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => onAvatarPick(e.target.files?.[0])}
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <Input label="Shop name" value={form.name} onChange={set("name")} />
                <Input
                  label="Username"
                  value={form.handle}
                  onChange={set("handle")}
                  error={form.handle ? (handleIssue ?? undefined) : undefined}
                />
                <div className="col-span-2">
                  <Input label="Location" value={form.location} onChange={set("location")} />
                </div>
                <Input label="WhatsApp" value={form.whatsapp} onChange={set("whatsapp")} />
                <Input label="Instagram" value={form.instagram} onChange={set("instagram")} />
                <div className="col-span-2">
                  <Input label="Facebook" value={form.facebook} onChange={set("facebook")} />
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Button onClick={saveProfile} disabled={updateMut.isPending || Boolean(handleIssue)}>
                  {updateMut.isPending && <Loader2 className="size-4 animate-spin" />}
                  Save profile
                </Button>
              </div>
            </section>

            {/* search & sharing */}
            {seoPreview && (
              <section className="rounded-card bg-card p-6 shadow-soft">
                <h2 className="text-lg font-extrabold text-ink">Search &amp; sharing</h2>
                <p className="mt-1 text-sm text-muted">
                  How your shop looks in Google and when someone shares your link. Leave these
                  blank and we write them from your shop name, location and categories.
                </p>

                <div className="mt-5 space-y-4">
                  <div>
                    <Input
                      label="Tagline"
                      name="tagline"
                      value={form.tagline}
                      maxLength={60}
                      placeholder="e.g. Handmade jewellery, Nairobi"
                      onChange={set("tagline")}
                    />
                    <div className="mt-1 flex justify-between gap-3">
                      <p className="text-xs text-muted">
                        Shown after your shop name in the page title.
                      </p>
                      <CharCount value={form.tagline} ideal={20} max={60} />
                    </div>
                  </div>

                  <div>
                    <Textarea
                      label="Search description"
                      name="metaDescription"
                      rows={3}
                      maxLength={160}
                      value={form.metaDescription}
                      placeholder="What you sell, who it is for, and where you deliver."
                      onChange={set("metaDescription")}
                    />
                    <div className="mt-1 flex justify-between gap-3">
                      <p className="text-xs text-muted">
                        The grey text under your title in search results.
                      </p>
                      <CharCount value={form.metaDescription} ideal={70} max={160} />
                    </div>
                  </div>

                  <SeoPreviews seo={seoPreview} />
                </div>

                <div className="mt-5 flex justify-end">
                  <Button onClick={saveProfile} disabled={updateMut.isPending}>
                    {updateMut.isPending && <Loader2 className="size-4 animate-spin" />}
                    Save
                  </Button>
                </div>
              </section>
            )}

            {/* account */}
            <section className="rounded-card bg-card p-6 shadow-soft">
              <h2 className="text-lg font-extrabold text-ink">Account</h2>
              <div className="mt-4 flex items-end gap-3">
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => emailMut.mutate(email.trim())}
                  disabled={emailMut.isPending || !email.trim() || email.trim() === session?.email}
                >
                  {emailMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  Update
                </Button>
              </div>
            </section>

            {/* sign out */}
            <section className="rounded-card bg-card p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-ink">Sign out</h2>
                  <p className="mt-0.5 text-sm text-muted">End your session on this device.</p>
                </div>
                <Button variant="danger" onClick={handleSignOut}>
                  <LogOut className="size-4" /> Sign out
                </Button>
              </div>
            </section>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
