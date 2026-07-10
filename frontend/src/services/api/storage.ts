import type { StorageService } from "../types";
import { requireUserId, supabase } from "./client";

const BUCKET = "media";

/** Best-effort file extension from the file name/type, defaulting to jpg. */
function extFor(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromType = file.type.split("/").pop();
  return fromType || "jpg";
}

/**
 * Uploads images to the public `media` bucket under `<folder>/<uid>/<uuid>.<ext>`
 * and returns the public URL. RLS lets authenticated merchants write; anyone reads.
 */
export const storageApi: StorageService = {
  async uploadImage(file: File, folder: string): Promise<string> {
    const uid = await requireUserId();
    const path = `${folder}/${uid}/${crypto.randomUUID()}.${extFor(file)}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },
};
