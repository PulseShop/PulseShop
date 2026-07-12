import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Gallery } from "@/components/product/Gallery";
import { ProductCard } from "@/components/product/ProductCard";
import { RatingRow } from "@/components/product/RatingRow";
import { SizeSelector } from "@/components/product/SizeSelector";
import { StockBadge } from "@/components/product/StockBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ProductCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";

/** Storybook-style gallery of every primitive — Phase 1 acceptance route. */
export function ComponentsPage() {
  const productsQ = useQuery({
    queryKey: ["products", "gallery"],
    queryFn: () => services.products.listProducts({ pageSize: 1 }),
  });
  const [size, setSize] = useState<string | null>("M");
  const [modalOpen, setModalOpen] = useState(false);
  const push = useToasts((s) => s.push);
  const sample = productsQ.data?.items[0];

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-8">
      <h1 className="text-2xl font-extrabold text-ink">Component Gallery</h1>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="dark">Dark</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="whatsapp">WhatsApp</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Badges & Stock">
        <div className="flex flex-wrap gap-3">
          <Badge tone="success" dot>Available</Badge>
          <Badge tone="warning" dot>Low Stock</Badge>
          <Badge tone="danger" dot>Out of Stock</Badge>
          <Badge tone="primary">Primary</Badge>
          <Badge>Neutral</Badge>
          <StockBadge status="available" />
          <StockBadge status="low" />
          <StockBadge status="out" />
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-md gap-4">
          <Input label="Name" placeholder="Jane Wanjiku" />
          <Input label="Phone" placeholder="+254 712 345 678" error="Enter a valid phone number" />
          <Textarea label="Notes" placeholder="Anything else…" />
        </div>
      </Section>

      <Section title="Size selector">
        <SizeSelector sizes={["S", "M", "L", "XL"]} value={size} onChange={setSize} />
      </Section>

      <Section title="Rating">
        <RatingRow rating={4.8} reviewCount={64} />
      </Section>

      <Section title="Skeletons">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <ProductCardSkeleton />
          <div className="space-y-2">
            <Skeleton className="h-6 w-full rounded" />
            <Skeleton className="h-6 w-3/4 rounded" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </Section>

      <Section title="Modal & Toast">
        <div className="flex gap-3">
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="outline" onClick={() => push("Hello from a toast!", "success")}>
            Show toast
          </Button>
        </div>
        <Modal open={modalOpen} onOpenChange={setModalOpen} title="Example modal" description="Radix dialog with backdrop blur">
          <p className="text-sm text-muted">Press Esc or click the scrim to close.</p>
        </Modal>
      </Section>

      <Section title="Product card & gallery (mock data)">
        {sample ? (
          <div className="grid grid-cols-2 gap-6">
            <div className="max-w-56">
              <ProductCard product={sample} />
            </div>
            <Gallery images={sample.images} alt={sample.name} />
          </div>
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}
