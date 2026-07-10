import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";

/**
 * Follow/Following toggle for a shop. Guests are sent to login; signed-in
 * users toggle optimistically against the shared ["following"] query.
 */
export function FollowButton({
  merchantId,
  className,
}: {
  merchantId: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const session = useAuth((s) => s.session);
  const queryClient = useQueryClient();

  const followingQ = useQuery({
    queryKey: ["following"],
    queryFn: services.follows.listFollowing,
    enabled: Boolean(session),
  });
  const isFollowing = (followingQ.data ?? []).includes(merchantId);

  const toggle = useMutation({
    mutationFn: () =>
      isFollowing ? services.follows.unfollow(merchantId) : services.follows.follow(merchantId),
    // Optimistic toggle so the button flips instantly.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["following"] });
      const previous = queryClient.getQueryData<string[]>(["following"]);
      queryClient.setQueryData<string[]>(["following"], (ids = []) =>
        isFollowing ? ids.filter((id) => id !== merchantId) : [...ids, merchantId],
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(["following"], ctx?.previous);
      push("Couldn't update follow — try again", "danger");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["following"] }),
  });

  const onClick = () => {
    if (!session) {
      push("Sign in to follow shops");
      navigate("/login");
      return;
    }
    toggle.mutate();
  };

  return (
    <Button
      size="sm"
      variant={isFollowing ? "outline" : "primary"}
      className={cn("rounded-full", className)}
      aria-pressed={isFollowing}
      onClick={onClick}
    >
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
