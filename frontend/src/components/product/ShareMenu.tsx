import * as Popover from "@radix-ui/react-popover";
import { CircleHelp, ImageDown, Loader2, Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FacebookIcon, WhatsAppIcon, InstagramIcon } from "@/components/ui/BrandIcons";
import { formatKes, hasPriceRange, minVariantPrice } from "@/lib/currency";
import { productShareLinks } from "@/lib/deeplinks";
import { shareableUrl } from "@/lib/shareLinks";
import { cardFileName, downloadCardImage, statusCaption } from "@/lib/statusCard";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";
import type { Product, ShareChannel } from "@/types";
import { InstagramStoryTemplate } from "./InstagramStoryTemplate";
import { InstagramStoryTutorialModal } from "./InstagramStoryTutorialModal";
import { CARD_BACKGROUND, StatusCardTemplate } from "./StatusCardTemplate";

/**
 * Share-this-product control. Where the native Web Share sheet is available
 * (most mobile browsers) it's offered as the first, fastest option — one tap
 * surfaces every app the seller has installed. Instagram has no web share
 * endpoint of its own though, so the menu also offers an Instagram Story
 * generator: Meta blocks third-party apps from placing the link sticker
 * automatically, so the best we can do is hand the seller a ready-made 9:16
 * graphic with the product link already on their clipboard, and let them
 * paste it onto the Story themselves in the Instagram app.
 *
 * ATTRIBUTION (migration 0052): when the seller shares their OWN product, each
 * destination gets its own short `/s/CODE` link, so the dashboard can later
 * say which channel actually paid. Everyone else — a shopper sending a friend
 * a product — shares the plain canonical URL, since a share link belongs to
 * the shop that minted it and there is nothing to attribute a stranger's
 * share to.
 */
export function ShareMenu({
  product,
  isOwner = false,
  triggerClassName,
  iconClassName = "size-5",
}: {
  product: Product;
  /** True when the viewer is the merchant who owns this product. Only they get
   * tracked short links; see the note above. */
  isOwner?: boolean;
  triggerClassName: string;
  iconClassName?: string;
}) {
  const push = useToasts((s) => s.push);
  const shopName = useAuth((s) => s.session?.shopName) || "Our shop";
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [storyProduct, setStoryProduct] = useState<Product | null>(null);
  // The Status card needs its link BAKED IN (Status has nothing tappable), so
  // unlike the Story template it cannot mount until the URL has resolved.
  const [statusCard, setStatusCard] = useState<{ product: Product; url: string } | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const links = productShareLinks(product);
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  /** The URL to hand this particular destination. Never throws — a failure to
   * mint a tracked link degrades to the plain product URL rather than
   * blocking the share. */
  const urlFor = (channel: ShareChannel) =>
    shareableUrl(services.shareLinks.ensureLink, {
      isOwner,
      productId: product.id,
      channel,
      fallbackUrl: links.url,
    });

  const copyLink = async () => {
    const url = await urlFor("instagram");
    await navigator.clipboard.writeText(url);
    push("Link copied — paste it in your Instagram bio or story", "success");
    setOpen(false);
  };

  const nativeShare = async () => {
    setOpen(false);
    const url = await urlFor("other");
    try {
      await navigator.share({ title: product.name, text: links.caption, url });
    } catch {
      /* user cancelled */
    }
  };

  // Facebook and WhatsApp are plain anchors, so their href has to be ready
  // before the click rather than resolved during it. Minting happens when the
  // menu opens, which is also the last moment the seller could still change
  // their mind about sharing at all.
  const [channelUrls, setChannelUrls] = useState<{ facebook: string; whatsapp: string }>({
    facebook: links.facebook,
    whatsapp: links.whatsapp,
  });

  const prepare = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen || !isOwner) return;
    const [fb, wa] = await Promise.all([urlFor("facebook"), urlFor("whatsapp")]);
    setChannelUrls({
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fb)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${links.caption} ${wa}`)}`,
    });
  };

  /**
   * Copy `text`, reporting whether it landed. Never throws: by the time this
   * runs the image is already on the seller's phone, so a clipboard refusal
   * (permission denied, insecure context) is a smaller ask to type the link by
   * hand, not a failed share.
   */
  const tryCopy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const generateStory = async () => {
    setOpen(false);
    setGenerating(true);
    try {
      const url = await urlFor("instagram");
      // Mount the hidden 1080x1920 template synchronously so templateRef is
      // populated before html2canvas reads it — a normal setState wouldn't
      // commit in time inside this async handler.
      flushSync(() => setStoryProduct(product));
      await downloadCardImage(
        templateRef.current!,
        cardFileName(product.sku, "instagram-story"),
        "#fafaf9",
      );

      push(
        (await tryCopy(url))
          ? "Story image downloaded and link copied — open Instagram Stories, add the image, then use the Link sticker to paste it in."
          : `Story image downloaded. Copy your link — ${url} — then paste it with the Link sticker in Instagram Stories.`,
        "success",
      );
    } catch {
      push("Couldn't generate the Story image — try again.", "danger");
    } finally {
      setGenerating(false);
      setStoryProduct(null);
    }
  };

  /**
   * The Status kit: a 9:16 card with the short link printed on it, plus a
   * ready-to-paste caption.
   *
   * Status is where the reach is here — it reaches every contact who has saved
   * the seller's number, and it expires in 24 hours. That expiry is the whole
   * design constraint: this is a graphic the seller needs a NEW copy of every
   * single day, so the entire flow is one tap. Anything longer and they go
   * back to screenshotting the product page and cropping it badly.
   */
  const generateStatusCard = async () => {
    setOpen(false);
    setGenerating(true);
    try {
      const url = await urlFor("status");
      // Unlike the Story path, this waits on the URL before rendering: the
      // link is drawn INTO the image, so mounting first would bake in a
      // placeholder.
      flushSync(() => setStatusCard({ product, url }));
      await downloadCardImage(
        statusRef.current!,
        cardFileName(product.sku, "whatsapp-status"),
        CARD_BACKGROUND,
      );

      const caption = statusCaption({
        productName: product.name,
        price: `${hasPriceRange(product) ? "from " : ""}${formatKes(minVariantPrice(product))}`,
        url,
        inStock: product.status !== "out",
      });

      push(
        (await tryCopy(caption))
          ? "Status image saved and caption copied — post it to your WhatsApp Status, then paste the caption."
          : `Status image saved. The link is printed on it: ${url}`,
        "success",
      );
    } catch {
      push("Couldn't make the Status image — try again.", "danger");
    } finally {
      setGenerating(false);
      setStatusCard(null);
    }
  };

  return (
    <>
      {storyProduct && <InstagramStoryTemplate ref={templateRef} product={storyProduct} shopName={shopName} />}
      {statusCard && (
        <StatusCardTemplate
          ref={statusRef}
          product={statusCard.product}
          shopName={shopName}
          url={statusCard.url}
        />
      )}
      <Popover.Root open={open} onOpenChange={prepare}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Share this product"
            disabled={generating}
            className={triggerClassName}
          >
            {generating ? <Loader2 className={`${iconClassName} animate-spin`} /> : <Share2 className={iconClassName} />}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={8}
            align="end"
            className="z-50 w-64 rounded-card border border-line-soft bg-card p-1.5 shadow-modal animate-modal-in"
          >
            <button
              type="button"
              onClick={generateStatusCard}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-fill-soft"
            >
              <WhatsAppIcon className="size-4 text-whatsapp" />
              Save for WhatsApp Status
            </button>
            {canNativeShare && (
              <button
                type="button"
                onClick={nativeShare}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-fill-soft"
              >
                <Share2 className="size-4 text-muted" />
                Share...
              </button>
            )}
            <div className="flex items-center rounded-lg hover:bg-fill-soft">
              <button
                type="button"
                onClick={generateStory}
                className="flex flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold text-ink"
              >
                <ImageDown className="size-4 text-instagram" />
                Generate Instagram Story
              </button>
              <button
                type="button"
                aria-label="How to post this to your Instagram Story"
                onClick={() => {
                  setOpen(false);
                  setTutorialOpen(true);
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-fill hover:text-ink"
              >
                <CircleHelp className="size-4" />
              </button>
            </div>
            <a
              href={channelUrls.facebook}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-fill-soft"
            >
              <FacebookIcon className="size-4 text-facebook" />
              Share to Facebook
            </a>
            <a
              href={channelUrls.whatsapp}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-fill-soft"
            >
              <WhatsAppIcon className="size-4 text-whatsapp" />
              Share to WhatsApp
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-fill-soft"
            >
              <InstagramIcon className="size-4 text-instagram" />
              Copy link for Instagram
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <InstagramStoryTutorialModal open={tutorialOpen} onOpenChange={setTutorialOpen} />
    </>
  );
}
