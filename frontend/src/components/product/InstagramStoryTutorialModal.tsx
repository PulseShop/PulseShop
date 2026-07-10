import { Modal } from "@/components/ui/Modal";
import { INSTAGRAM_STORY_STEPS } from "@/lib/instagramStorySteps";

export function InstagramStoryTutorialModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Posting your Story to Instagram"
      description="Instagram doesn't let apps place the link sticker for you, so this last part is a quick manual step."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {INSTAGRAM_STORY_STEPS.map((step, i) => (
          <div key={step.title} className="flex gap-3 rounded-card border border-stone-100 bg-card p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-instagram/10">
              <step.icon className="size-5 text-instagram" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Step {i + 1}</p>
              <p className="font-bold text-ink">{step.title}</p>
              <p className="mt-0.5 text-sm text-muted">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
