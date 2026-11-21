/**
 * "Add from your jobs": put photos from finished jobs on the website's "Our work". Used in
 * Settings → Your website (latest photos from every job) and on a finished job's sheet (that
 * job's photos). The owner picks each one: job photos can show a customer's home.
 */
import { useState } from "react";
import { Check, ImagePlus, Loader2 } from "lucide-react";

import { toast } from "@/components/ui/sonner";
import { useAddJobPhotoToSite, useSiteJobPhotos, type SiteJobPhotos } from "@/lib/site-api";
import { cn } from "@/lib/utils";

function PhotoGrid({ data, onAdd, adding }: { data: SiteJobPhotos; onAdd: (id: string) => void; adding: string | null }) {
  const full = data.room === 0;
  return (
    <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {data.photos.map((p) => (
        <li key={p.id} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary">
          {p.url && <img src={p.url} alt={p.jobTitle ? `Photo from ${p.jobTitle}` : "Job photo"} loading="lazy" className="w-full h-full object-cover" />}
          <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent">
            {p.onSite ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white">
                <Check className="w-3 h-3" /> On your website
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onAdd(p.id)}
                disabled={full || adding !== null}
                aria-label={`Add ${p.jobTitle ? `photo from ${p.jobTitle}` : "this photo"} to your website`}
                className="inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-neutral-900 disabled:opacity-60"
              >
                {adding === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />} Add to website
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function useAdd(orgId: string, companyId: string) {
  const add = useAddJobPhotoToSite(orgId, companyId);
  const [adding, setAdding] = useState<string | null>(null);
  const run = async (id: string) => {
    setAdding(id);
    try {
      await add.mutateAsync(id);
      toast.success("Added to your website, under \"Our work\".");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that photo.");
    } finally {
      setAdding(null);
    }
  };
  return { adding, run };
}

/** Settings → Your website: the latest photos from all jobs. */
export function SiteJobPhotoPicker({ orgId, companyId }: { orgId: string; companyId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useSiteJobPhotos(orgId, companyId, null, open);
  const { adding, run } = useAdd(orgId, companyId);
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Add photos from your jobs</h3>
          <p className="text-xs text-muted-foreground mt-1">Put before-and-after shots from your jobs under "Our work". Only add photos the customer would be happy to see online.</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary">
          {open ? "Close" : "Choose photos"}
        </button>
      </div>
      {open &&
        (isLoading || !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your job photos…
          </p>
        ) : data.photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No job photos yet. Photos you take on a job show up here.</p>
        ) : (
          <>
            {data.room === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Your page has 6 photos, the most it holds. Remove one above to add another.</p>}
            <PhotoGrid data={data} onAdd={(id) => void run(id)} adding={adding} />
          </>
        ))}
    </div>
  );
}

/** A finished job's sheet: offer its photos for the website (owners/admins, once there's a page). */
export function JobPhotosToWebsite({ orgId, companyId, bookingId }: { orgId: string; companyId: string; bookingId: string }) {
  const { data } = useSiteJobPhotos(orgId, companyId, bookingId);
  const { adding, run } = useAdd(orgId, companyId);
  if (!data || !data.hasSite || data.photos.length === 0) return null;
  const allOn = data.photos.every((p) => p.onSite);
  return (
    <div className={cn("rounded-lg border p-3 space-y-2", allOn ? "border-border" : "border-primary/30 bg-primary/5")}>
      <p className="text-sm font-medium text-foreground">{allOn ? "These photos are on your website." : "Show this job off on your website?"}</p>
      {!allOn && <p className="text-xs text-muted-foreground">Tap a photo to add it under "Our work". Only add ones the customer would be happy to see online.</p>}
      {data.room === 0 && !allOn && <p className="text-xs text-amber-700 dark:text-amber-300">Your page already has 6 photos. Remove one in Settings → Your website first.</p>}
      <PhotoGrid data={data} onAdd={(id) => void run(id)} adding={adding} />
    </div>
  );
}
