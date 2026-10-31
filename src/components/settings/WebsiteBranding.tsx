/**
 * Settings → Your website: logo and photos, the browser-tab icon, and the business's own domain
 * (docs/done-for-you.md → "Generated sites" → "Images and your own domain").
 */
import { useRef, useState } from "react";
import { CheckCircle2, Copy, Globe, ImagePlus, Loader2, RefreshCw, Star, Trash2 } from "lucide-react";

import { toast } from "@/components/ui/sonner";
import { useSiteDomain, useSiteImages, type SiteImageKind, type SiteView } from "@/lib/site-api";
import { cn } from "@/lib/utils";

const cardCls = "rounded-xl border border-border p-4 space-y-3";
const hintCls = "text-xs text-muted-foreground";
const btnCls =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Couldn't do that. Try again.";
}

/** A hidden file input behind a button. */
function PickImage({ label, disabled, onPick, testId }: { label: string; disabled: boolean; onPick: (file: File) => void; testId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={btnCls} disabled={disabled} onClick={() => ref.current?.click()}>
        <ImagePlus className="w-3.5 h-3.5" /> {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        data-testid={testId}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </>
  );
}

export function SiteImagesCard({ orgId, view }: { orgId: string; view: SiteView }) {
  const { upload, change } = useSiteImages(orgId, view.companyId);
  const [working, setWorking] = useState<SiteImageKind | null>(null);
  const canManage = view.canManage;
  const busy = upload.isPending || change.isPending;
  const site = view.site;
  const full = view.photos.length >= view.maxPhotos;

  const add = async (kind: SiteImageKind, file: File, done: string) => {
    setWorking(kind);
    try {
      await upload.mutateAsync({ kind, file });
      toast.success(done);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setWorking(null);
    }
  };
  const act = async (input: { action: "remove" | "cover"; kind: SiteImageKind; url?: string }, done: string) => {
    try {
      await change.mutateAsync(input);
      toast.success(done);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <section className={cardCls} aria-labelledby="site-images-title">
      <div>
        <h3 id="site-images-title" className="text-sm font-semibold text-foreground">
          Logo and photos
        </h3>
        <p className={hintCls}>Your logo shows at the top of the page and on your quotes and invoices. The first photo is the big one at the top; the rest show under "Our work".</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-40 h-20 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden" data-testid="logo-preview">
          {view.logoUrl ? <img src={view.logoUrl} alt="Your logo" className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-neutral-500">No logo yet</span>}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <PickImage label={view.logoUrl ? "Replace logo" : "Upload logo"} disabled={busy} testId="logo-input" onPick={(f) => void add("logo", f, "Logo saved")} />
            {view.logoUrl && (
              <button type="button" className={btnCls} disabled={busy} onClick={() => void act({ action: "remove", kind: "logo" }, "Logo removed")}>
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
        )}
        {working === "logo" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      <div>
        <p className="text-sm font-medium text-foreground mb-2">
          Photos <span className="text-muted-foreground font-normal">({view.photos.length} of {view.maxPhotos})</span>
        </p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {view.photos.map((url, i) => (
            <li key={url} className="relative group rounded-lg overflow-hidden border border-border aspect-[4/3] bg-secondary">
              <img src={url} alt={i === 0 ? "Cover photo" : `Photo ${i + 1}`} className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium">Cover</span>}
              {canManage && (
                <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                  {i > 0 && (
                    <button type="button" disabled={busy} onClick={() => void act({ action: "cover", kind: "photo", url }, "Cover photo changed")} className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80" aria-label={`Make photo ${i + 1} the cover`}>
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => void act({ action: "remove", kind: "photo", url }, "Photo removed")} className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80" aria-label={`Remove photo ${i + 1}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
          {working === "photo" && (
            <li className="rounded-lg border border-dashed border-border aspect-[4/3] flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </li>
          )}
        </ul>
        {canManage && !full && (
          <div className="mt-2">
            <PickImage label="Add a photo" disabled={busy} testId="photo-input" onPick={(f) => void add("photo", f, "Photo added")} />
          </div>
        )}
        {view.photos.length === 0 && <p className={cn(hintCls, "mt-2")}>Photos of your work make the page feel real. Phone photos are fine.</p>}
      </div>

      {site && (
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <div className="w-10 h-10 rounded-md border border-border bg-white flex items-center justify-center overflow-hidden" data-testid="favicon-preview">
            {site.faviconUrl || view.logoUrl ? <img src={site.faviconUrl ?? view.logoUrl ?? ""} alt="Tab icon" className="w-8 h-8 object-contain" /> : <Globe className="w-4 h-4 text-neutral-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Browser tab icon</p>
            <p className={hintCls}>{site.faviconUrl ? "Shows in the browser tab and on phone home screens." : "Uses your logo until you add one. A simple square image works best."}</p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <PickImage label={site.faviconUrl ? "Replace" : "Upload icon"} disabled={busy} testId="favicon-input" onPick={(f) => void add("favicon", f, "Tab icon saved")} />
              {site.faviconUrl && (
                <button type="button" className={btnCls} disabled={busy} onClick={() => void act({ action: "remove", kind: "favicon" }, "Tab icon removed")}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => toast.success("Copied"),
          () => toast.error("Couldn't copy. Select it and copy it."),
        );
      }}
      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
      aria-label={`Copy ${label}`}
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}

export function SiteDomainCard({ orgId, view }: { orgId: string; view: SiteView }) {
  const { connect, check, remove } = useSiteDomain(orgId, view.companyId);
  const [domain, setDomain] = useState("");
  const site = view.site;
  if (!site) return null;
  const d = site.domain;
  const canManage = view.canManage;
  const busy = connect.isPending || check.isPending || remove.isPending;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <section className={cardCls} aria-labelledby="site-domain-title">
      <div>
        <h3 id="site-domain-title" className="text-sm font-semibold text-foreground">
          Your own domain
        </h3>
        <p className={hintCls}>Use an address you own, like www.yourbusiness.com, instead of {site.ourUrl.replace(/^https?:\/\//, "")}.</p>
      </div>

      {!d && (
        <>
          {!view.domainsEnabled ? (
            <p className="text-sm text-muted-foreground bg-secondary rounded-lg px-3 py-2">Connecting your own domain isn't switched on yet. Contact support and we'll set it up for you.</p>
          ) : canManage ? (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (domain.trim()) void run(() => connect.mutateAsync(domain.trim()), "Domain added. Now add the DNS records below.");
              }}
            >
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="www.yourbusiness.com"
                aria-label="Your domain"
                disabled={busy}
                className="min-w-0 flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <button type="submit" disabled={busy || !domain.trim()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                {connect.isPending ? "Connecting…" : "Connect"}
              </button>
            </form>
          ) : (
            <p className={hintCls}>Ask an owner or admin to connect a domain.</p>
          )}
          {view.domainsEnabled && <p className={hintCls}>You'll need to sign in where you bought the domain (GoDaddy, Namecheap, Cloudflare…) to add two records. We show you exactly what to type.</p>}
        </>
      )}

      {d && d.status === "active" && (
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <a href={`https://${d.name}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-foreground underline underline-offset-2">
            {d.name}
          </a>
          <span className={hintCls}>is live{site.status !== "published" ? ", once you publish the page" : ""}.</span>
        </div>
      )}

      {d && d.status !== "active" && (
        <div className="space-y-3" data-testid="domain-dns">
          {d.dns.records.length === 0 ? (
            <p className="text-sm text-foreground">
              <span className="font-medium">{d.name}</span> isn't set up on our side right now. Disconnect it below and connect it again.
            </p>
          ) : (
            <p className="text-sm text-foreground">
              <span className="font-medium">{d.name}</span> is waiting for DNS. Sign in where you bought the domain, open its DNS settings, and add these records:
            </p>
          )}
          {d.dns.records.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-secondary text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Type</th>
                  <th className="text-left font-medium px-3 py-2">Name / Host</th>
                  <th className="text-left font-medium px-3 py-2">Value / Points to</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.dns.records.map((r) => (
                  <tr key={`${r.type}-${r.name}`} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{r.type}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 font-mono break-all">
                        {r.name} <CopyValue value={r.name} label={`${r.type} name`} />
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 font-mono break-all">
                        {r.value} <CopyValue value={r.value} label={`${r.type} value`} />
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.status === "VALID" ? <span className="text-emerald-600">Found</span> : r.status === "INVALID" ? <span className="text-amber-600">Wrong value</span> : <span className="text-muted-foreground">Waiting</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          <p className={hintCls}>
            {d.dns.records.some((r) => r.name === "@") ? "\"@\" means the domain itself. If your provider won't take a CNAME on \"@\", use ALIAS or ANAME, or use www instead. " : ""}
            Changes usually show up within an hour, sometimes up to a day. We check again whenever you open this page. If it isn't working after a week, we disconnect it so you can try again.
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnCls} disabled={busy} onClick={() => void run(() => check.mutateAsync(), "Checked")}>
                <RefreshCw className={cn("w-3.5 h-3.5", check.isPending && "animate-spin")} /> Check now
              </button>
            </div>
          )}
        </div>
      )}

      {d && canManage && (
        <button type="button" className="text-xs text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => void run(() => remove.mutateAsync(), "Domain disconnected")}>
          Disconnect {d.name}
        </button>
      )}
    </section>
  );
}
