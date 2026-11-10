import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isDoneForYouBrand, receptionistCopy } from "@/lib/platform-brand";
import {
  Building2, ClipboardList, Phone, CreditCard, Globe, PhoneCall, Users, Zap,
  Check, Loader2, ArrowRight, Upload, Sparkles, ExternalLink, X, Bot,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ForwardingTestPanel } from "@/components/onboarding/ForwardingTestPanel";
import { PhoneModeStep } from "@/components/onboarding/PhoneModeStep";
import { OwnerCellVerify } from "@/components/onboarding/OwnerCellVerify";
import { YourAiStep } from "@/components/onboarding/YourAiStep";
import { HelpButton } from "@/components/help/HelpPanel";
import { useOrg } from "@/lib/org-context";
import { SetupProgressScreen } from "@/components/onboarding/SetupProgress";
import { useSetupProgress } from "@/lib/dfy-api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/components/ui/sonner";
import { relativeTime } from "@/lib/format";
import {
  useOnboardingProgress,
  useSaveOnboardingBusiness,
  useUpsertOnboardingStep,
  useSaveCatalogItems,
  useProvisionOnboardingPhone,
  useSendOnboardingTestLead,
  useConnectAccounts,
  useCreateConnectOnboarding,
  useRefreshConnectAccount,
  useInvitations,
  useCreateInvitation,
  useRecipeCatalog,
  useInstallRecipes,
  useDashboardActivity,
} from "@/lib/api-hooks";
import {
  createIntakeKey,
  createOrganization,
  parseWebsiteCatalog,
  uploadOnboardingLogo,
  type CatalogDraft,
  type CatalogItemInput,
  type CreatedIntakeKey,
  type OnboardingCompanyProfile,
  type SaveBusinessInput,
} from "@/lib/api-client";
import { WebsiteFormStep } from "@/components/website-forms/WebsiteFormsPanel";
import { IndustryPackPicker } from "@/components/onboarding/IndustryPackPicker";
import { useIndustryPacks, usePackRecipes } from "@/lib/industry-pack-hooks";
import { useBrand } from "@/lib/brand-context";
import { ProductName } from "@/components/brand/Logo";
import { isStepDone, isStepSkipped, phoneModeOf, resolveWizardStep, setupSummary, wizardGroups } from "@/lib/onboarding-steps";

const STEPS = [
  { key: "business", title: "Business", icon: Building2 },
  { key: "services", title: "Services", icon: ClipboardList },
  { key: "phone", title: "Phone", icon: Phone },
  { key: "ai", title: "Your AI", icon: Bot },
  { key: "payments", title: "Payments", icon: CreditCard },
  { key: "website", title: "Website leads", icon: Globe },
  { key: "test_call", title: "Test call", icon: PhoneCall },
  { key: "team", title: "Team", icon: Users },
  { key: "recipes", title: "Automations", icon: Zap },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const input = "w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30";
const label = "text-xs font-medium text-muted-foreground mb-1.5 block";
const primaryBtn = "flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 active:scale-[0.97]";

interface StepProps {
  orgId: string;
  companyId: string | null;
  companyName: string | null;
  /** What the company already has (Business step pre-fill). */
  profile: OnboardingCompanyProfile | null;
  stepData: Record<string, unknown>;
  onDone: () => void;
  /** "Skip for now": move on, and remember it wasn't done (the rail and Home don't tick it). */
  onSkip: () => void;
}

// ── Step 1: Business ──────────────────────────────────────────────────────────
function BusinessStep({ orgId, companyId, companyName, profile, onDone }: StepProps) {
  const brand = useBrand();
  const save = useSaveOnboardingBusiness(orgId);
  // Pre-filled from what's saved, and only CHANGED fields are sent — so coming back to this step
  // and saving never wipes the website, hours or cell (it used to send blanks as null).
  const initial = useMemo(
    () => ({
      name: companyName ?? "",
      website: profile?.website ?? "",
      timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Toronto",
      hours: profile?.hours ?? "",
      serviceArea: profile?.serviceArea ?? "",
      ownerEmail: profile?.ownerEmail ?? "",
      ownerPhone: profile?.ownerPhone ?? "",
    }),
    [companyName, profile],
  );
  const [name, setName] = useState(initial.name);
  const [website, setWebsite] = useState(initial.website);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [hours, setHours] = useState(initial.hours);
  const [serviceArea, setServiceArea] = useState(initial.serviceArea);
  const [ownerEmail, setOwnerEmail] = useState(initial.ownerEmail);
  const [ownerPhone, setOwnerPhone] = useState(initial.ownerPhone);
  const [logoUrl, setLogoUrl] = useState<string | null>(profile?.logoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  // After saving with a cell that isn't confirmed yet: confirm it here, right away.
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogo = async (file: File) => {
    if (!companyId) {
      toast.error("Save your business name first, then add a logo.");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadOnboardingLogo(orgId, companyId, file);
      setLogoUrl(url);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) return;
    const changed = (now: string, was: string) => now.trim() !== was.trim();
    const body: SaveBusinessInput = { companyId: companyId ?? undefined, name: name.trim() };
    if (!companyId || changed(website, initial.website)) body.website = website.trim() || null;
    if (!companyId || !profile?.timezone || changed(timezone, initial.timezone)) body.timezone = timezone.trim() || null;
    if (!companyId || changed(hours, initial.hours)) body.hours = hours.trim() ? { summary: hours.trim() } : null;
    if (!companyId || changed(serviceArea, initial.serviceArea)) body.serviceArea = serviceArea.trim() || null;
    if (!companyId || changed(ownerEmail, initial.ownerEmail)) body.ownerEmail = ownerEmail.trim() || null;
    if (!companyId || changed(ownerPhone, initial.ownerPhone)) body.ownerPhone = ownerPhone.trim() || null;
    if (logoUrl !== (profile?.logoUrl ?? null)) body.brandLogoUrl = logoUrl;
    try {
      const saved = await save.mutateAsync(body);
      toast.success("Business profile saved");
      const cellChanged = !companyId || changed(ownerPhone, initial.ownerPhone);
      if (ownerPhone.trim() && (cellChanged || !profile?.ownerPhoneVerified)) setConfirmFor(saved.company.id);
      else onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    }
  };

  if (confirmFor) {
    return (
      <div className="space-y-4 max-w-xl">
        <p className="text-sm text-muted-foreground">Saved. One more thing: confirm your cell so your AI can reach you.</p>
        <OwnerCellVerify orgId={orgId} companyId={confirmFor} onConfirmed={onDone} onSkip={onDone} />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">Tell us about your business. {receptionistCopy("This shapes Marina's script, your quotes, and your branding.", brand)}</p>
      <div>
        <label className={label}>Business name <span className="text-destructive">*</span></label>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., A1 Marine Care" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Website</label><input className={input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" /></div>
        <div><label className={label}>Timezone</label><input className={input} value={timezone} onChange={(e) => setTimezone(e.target.value)} /></div>
      </div>
      <div><label className={label}>Business hours</label><input className={input} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Mon–Fri 8am–5pm" /></div>
      <div><label className={label}>Service area</label><input className={input} value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="Greater Toronto Area" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Owner email</label><input className={input} value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="you@company.com" /></div>
        <div>
          <label className={label}>
            Your cell {profile?.ownerPhoneVerified && !(ownerPhone.trim() !== initial.ownerPhone.trim()) ? <span className="text-emerald-400">· confirmed</span> : null}
          </label>
          <input className={input} inputMode="tel" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="(705) 555-0123" />
          <p className="text-[11px] text-muted-foreground mt-1">Your AI texts you here when it needs your OK. We'll text a code to confirm it.</p>
        </div>
      </div>
      <div>
        <label className={label}>Logo {!companyId && <span className="text-muted-foreground/60">(save first)</span>}</label>
        <div className="flex items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="logo" className="w-10 h-10 rounded-lg object-contain bg-secondary" />}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogo(f); }} />
          <button type="button" disabled={!companyId || uploading} onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
          </button>
        </div>
      </div>
      <button className={primaryBtn} disabled={!name.trim() || save.isPending} onClick={() => void submit()}>
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save & continue
      </button>
    </div>
  );
}

// ── Step 2: Services ────────────────────────────────────────────────────────
function ServicesStep({ orgId, companyId, onDone }: StepProps) {
  const saveItems = useSaveCatalogItems(orgId);
  const { data: packs } = useIndustryPacks(orgId, companyId);
  const packApplied = Boolean(packs?.applied);
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<CatalogItemInput[]>([]);

  const draftToRow = (d: CatalogDraft): CatalogItemInput => ({
    label: d.name,
    description: d.description ?? null,
    pricingType: d.pricingType,
    rateCents: d.baseCents ?? 0,
  });

  const parse = async () => {
    if (!url.trim()) return;
    setParsing(true);
    try {
      const { drafts } = await parseWebsiteCatalog(orgId, url.trim());
      setRows(drafts.map(draftToRow));
      toast.success(`Found ${drafts.length} service${drafts.length === 1 ? "" : "s"} — review below`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that site.");
    } finally {
      setParsing(false);
    }
  };

  const update = (i: number, patch: Partial<CatalogItemInput>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addBlank = () => setRows((r) => [...r, { label: "", description: null, pricingType: "flat", rateCents: 0 }]);
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const save = async () => {
    const items = rows.filter((r) => r.label.trim());
    // A pack already added the services (owner prices them in the pack card) — nothing more to save.
    if (companyId && items.length === 0 && packApplied) return onDone();
    if (!companyId || items.length === 0) return;
    try {
      await saveItems.mutateAsync({ companyId, items });
      toast.success("Services saved");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save services.");
    }
  };

  return (
    <div className="space-y-4">
      <IndustryPackPicker orgId={orgId} companyId={companyId} />
      <p className="text-sm text-muted-foreground">{packApplied ? "Anything else? " : ""}Paste your website URL and we'll draft your service list — you edit and confirm before anything is saved. Prices stay blank unless your site states them.</p>
      <div className="flex gap-2 max-w-xl">
        <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourbusiness.com/services" />
        <button className={primaryBtn} disabled={!url.trim() || parsing} onClick={() => void parse()}>
          {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Read site
        </button>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 bg-card border border-border rounded-lg p-2">
              <input className={cn(input, "flex-1")} value={row.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Service name" />
              <select className={cn(input, "w-40")} value={row.pricingType} onChange={(e) => update(i, { pricingType: e.target.value })}>
                <option value="flat">Flat</option>
                <option value="per_unit">Per unit</option>
                <option value="per_measure">Per measure</option>
              </select>
              <input className={cn(input, "w-28")} type="number" min={0} value={row.rateCents / 100} onChange={(e) => update(i, { rateCents: Math.round(Number(e.target.value) * 100) || 0 })} placeholder="$ price" />
              <button onClick={() => remove(i)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={addBlank} className="text-xs font-medium text-primary hover:opacity-80">+ Add service manually</button>
      </div>
      <button className={primaryBtn} disabled={!companyId || (rows.filter((r) => r.label.trim()).length === 0 && !packApplied) || saveItems.isPending} onClick={() => void save()}>
        {saveItems.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{" "}
        {rows.filter((r) => r.label.trim()).length === 0 && packApplied ? "Continue" : `Save ${rows.filter((r) => r.label.trim()).length} services`}
      </button>
    </div>
  );
}

// ── Step 3: Phone ─────────────────────────────────────────────────────────────
function PhoneStep({ orgId, companyId, stepData, onDone }: StepProps) {
  const brand = useBrand();
  const provision = useProvisionOnboardingPhone(orgId);
  const [areaCode, setAreaCode] = useState("");
  const existingNumber = typeof stepData.phoneNumber === "string" ? stepData.phoneNumber : null;
  const [result, setResult] = useState<string | null>(existingNumber);

  const go = async () => {
    if (!companyId) return;
    try {
      const r = await provision.mutateAsync({ companyId, areaCode: areaCode ? Number(areaCode) : undefined });
      setResult(r.phoneNumberPretty ?? r.phoneNumber);
      toast.success(receptionistCopy(r.purchased ? "Number purchased & Marina is live" : "Marina is live on your number", brand));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provisioning failed.");
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">{isDoneForYouBrand(brand) ? "Get a phone number answered by your AI receptionist — built from the business + services you just entered." : "Get a phone number answered by Marina, your AI receptionist — built from the business + services you just entered."}</p>
      {result ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
          <p className="text-sm font-semibold text-emerald-400">{receptionistCopy("Marina is answering", brand)}</p>
          <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{result}</p>
        </div>
      ) : null}
      <div>
        <label className={label}>Preferred area code (optional)</label>
        <input className={cn(input, "w-40")} value={areaCode} onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="e.g. 705" />
      </div>
      <button className={primaryBtn} disabled={!companyId || provision.isPending} onClick={() => void go()}>
        {provision.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
        {result ? "Re-provision" : receptionistCopy("Get my Marina number", brand)}
      </button>
      <p className="text-[11px] text-muted-foreground/70">Already have a number you want to keep? You can port it later from Settings — for now, {receptionistCopy("get a Marina number to try it.", brand)}</p>
    </div>
  );
}

// ── Step 4: Payments ──────────────────────────────────────────────────────────
function PaymentsStep({ orgId, companyId, onDone, onSkip }: StepProps) {
  const { data: accounts, refetch } = useConnectAccounts(orgId, { enabled: Boolean(orgId) });
  const start = useCreateConnectOnboarding(orgId);
  const refresh = useRefreshConnectAccount(orgId);
  const status = useMemo(() => (accounts ?? []).find((a) => a.companyId === companyId) ?? null, [accounts, companyId]);

  useEffect(() => {
    if (status?.state === "ready") onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.state]);

  const connect = async () => {
    if (!companyId) return;
    try {
      const { url } = await start.mutateAsync(companyId);
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start Stripe onboarding.");
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">Connect Stripe so you can take deposits and payments. This opens Stripe in a new tab; come back and refresh when you're done.</p>
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-sm font-medium text-foreground">
          Status: {status ? (status.state === "ready" ? "Connected ✓" : status.state === "onboarding_incomplete" ? "In progress" : "Not connected") : "Not connected"}
        </p>
      </div>
      <div className="flex gap-2">
        <button className={primaryBtn} disabled={!companyId || start.isPending} onClick={() => void connect()}>
          {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} {status?.state === "ready" ? "Manage" : "Connect Stripe"}
        </button>
        <button className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-foreground hover:bg-secondary/80" disabled={!companyId} onClick={() => { if (companyId) refresh.mutate(companyId, { onSuccess: () => void refetch() }); }}>
          Refresh status
        </button>
      </div>
      <button className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={onSkip}>Skip for now →</button>
    </div>
  );
}

// ── Step 5: Website leads ─────────────────────────────────────────────────────
function WebsiteStep({ orgId, companyId, onDone }: StepProps) {
  const brand = useBrand();
  const [key, setKey] = useState<CreatedIntakeKey | null>(null);
  const [issuing, setIssuing] = useState(false);
  const testLead = useSendOnboardingTestLead(orgId);

  const issue = async () => {
    if (!companyId) return;
    setIssuing(true);
    try {
      setKey(await createIntakeKey(orgId, { companyId, label: "Website form" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't issue a key.");
    } finally {
      setIssuing(false);
    }
  };

  const test = async () => {
    if (!companyId) return;
    try {
      await testLead.mutateAsync(companyId);
      toast.success("Test lead sent — check your CRM / dashboard, it should appear now.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send a test lead.");
    }
  };

  const snippet = key
    ? `POST https://api.everdoer.com/api/intake\nx-everdoer-key: ${key.key}\nx-everdoer-signature: sha256=<hmac-sha256(body, key)>`
    : "";

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">Wire your website form to {brand.name}. Issue a key, drop it into your form's server, then send a test lead to see it land.</p>
      {!key ? (
        <button className={primaryBtn} disabled={!companyId || issuing} onClick={() => void issue()}>
          {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />} Issue an intake key
        </button>
      ) : (
        <>
          <div>
            <label className={label}>Your intake key (shown once — copy it now)</label>
            <code className="block text-xs bg-secondary rounded-lg p-2 break-all text-foreground">{key.key}</code>
          </div>
          <div>
            <label className={label}>Integration snippet</label>
            <pre className="text-[11px] bg-secondary rounded-lg p-2 whitespace-pre-wrap text-muted-foreground">{snippet}</pre>
          </div>
          <button className={primaryBtn} disabled={testLead.isPending} onClick={() => void test()}>
            {testLead.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Send a test lead
          </button>
        </>
      )}
    </div>
  );
}

// ── Step 6: Test call ─────────────────────────────────────────────────────────
function TestCallStep({ orgId, onDone, onSkip, phoneNumber }: StepProps & { phoneNumber?: string | null }) {
  const brand = useBrand();
  const { data: activity } = useDashboardActivity(orgId, { limit: 15 }, { refetchInterval: 6000 });
  const number = phoneNumber ?? null;
  const recentCall = useMemo(
    () => (activity ?? []).find((e) => typeof e.eventType === "string" && e.eventType.startsWith("call.")),
    [activity],
  );
  const seen = useRef(false);
  useEffect(() => {
    if (recentCall && !seen.current) { seen.current = true; toast.success(receptionistCopy("Call received — Marina answered!", brand)); onDone(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentCall]);

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">{receptionistCopy("Call your new number and have a quick chat with Marina.", brand)} When the call lands, this step completes automatically and you'll see it in your inbox.</p>
      {number ? (
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Call this number now</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{number}</p>
        </div>
      ) : (
        <p className="text-sm text-amber-400">Finish the Phone step first to get your number.</p>
      )}
      {recentCall ? (
        <p className="text-sm text-emerald-400 flex items-center gap-1.5"><Check className="w-4 h-4" /> {recentCall.entity?.label ?? recentCall.eventType} · {relativeTime(recentCall.occurredAt)}</p>
      ) : number ? (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Waiting for your call…</p>
      ) : null}
      <button className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={onSkip}>Skip for now →</button>
    </div>
  );
}

// ── Step 7: Team ────────────────────────────────────────────────────────────
function TeamStep({ orgId, onDone, onSkip }: StepProps) {
  const { data: invitations } = useInvitations(orgId);
  const invite = useCreateInvitation(orgId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");

  const send = async () => {
    if (!email.trim()) return;
    try {
      await invite.mutateAsync({ email: email.trim(), role });
      setEmail("");
      toast.success("Invitation sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the invite.");
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">Invite the people who'll help run the front desk. You can always do this later from Settings.</p>
      <div className="flex gap-2">
        <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
        <select className={cn(input, "w-32")} value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button className={primaryBtn} disabled={!email.trim() || invite.isPending} onClick={() => void send()}>
          {invite.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Invite"}
        </button>
      </div>
      {(invitations ?? []).length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {(invitations ?? []).map((i) => <li key={i.id}>{i.email} · {i.role} · pending</li>)}
        </ul>
      )}
      {/* Nobody invited = "later", not done. */}
      <button className="text-xs font-medium text-primary hover:opacity-80" onClick={(invitations ?? []).length > 0 ? onDone : onSkip}>
        {(invitations ?? []).length > 0 ? "Continue →" : "Skip for now →"}
      </button>
    </div>
  );
}

// ── Step 8: Recipes ───────────────────────────────────────────────────────────
function RecipesStep({ orgId, companyId, onDone }: StepProps) {
  const { data: recipes } = useRecipeCatalog(orgId, companyId);
  const install = useInstallRecipes(orgId);
  const { pack, applyRecipes, isPending: packPending } = usePackRecipes(orgId, companyId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    // With an industry pack, preselect the pack's automations; otherwise the default-on ones.
    if (recipes) setSelected(new Set(recipes.filter((r) => !r.installed && (pack ? pack.recipes.includes(r.slug) : r.defaultStatus === "active")).map((r) => r.slug)));
  }, [recipes, pack]);

  const toggle = (slug: string) => setSelected((s) => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  // Their trade's pack usually turned everything on already: say so, and keep the long list folded away.
  const allInstalled = Boolean(recipes && recipes.length > 0 && recipes.every((r) => r.installed));
  const [showAll, setShowAll] = useState(false);

  const go = async () => {
    if (!companyId) return;
    try {
      // Pack automations (chosen, or already installed) get the trade's wording; owner-edited ones are left alone.
      const packSlugs = pack ? pack.recipes.filter((s) => selected.has(s) || recipes?.some((r) => r.slug === s && r.installed)) : [];
      if (packSlugs.length > 0) await applyRecipes(packSlugs);
      const only = [...selected].filter((s) => !packSlugs.includes(s));
      if (only.length > 0) await install.mutateAsync({ companyId, only });
      toast.success("Automations turned on");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't install recipes.");
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      {allInstalled ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4" data-testid="recipes-all-on">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> Your automations are already on</p>
          <p className="text-xs text-muted-foreground mt-1">
            {recipes?.length} run in the background{pack ? `, written for your ${pack.name} pack` : ""} — texting back missed calls, following up on quotes, reminding customers about bookings. Nothing to do here; you can change any of them later under Automations.
          </p>
          <button type="button" className="mt-2 text-xs font-medium text-primary hover:opacity-80" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Hide the list" : "See what's on"}
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Turn on proven automations. These run in the background — reply to missed calls, follow up on quotes, remind about bookings.</p>
          {pack && <p className="text-xs text-primary">Messages are written for your {pack.name} pack.</p>}
        </>
      )}
      <div className={cn("space-y-2", allInstalled && !showAll && "hidden")}>
        {(recipes ?? []).map((r) => (
          <label key={r.slug} className="flex items-start gap-3 bg-card border border-border rounded-lg p-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={r.installed || selected.has(r.slug)} disabled={r.installed} onChange={() => toggle(r.slug)} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{r.name} {r.installed && <span className="text-[10px] text-emerald-400">· installed</span>}{pack?.recipes.includes(r.slug) && <span className="text-[10px] text-primary"> · {pack.name}</span>}</p>
              <p className="text-xs text-muted-foreground">{r.description}</p>
            </div>
          </label>
        ))}
      </div>
      <button className={primaryBtn} disabled={!companyId || install.isPending || packPending} onClick={() => void go()}>
        {install.isPending || packPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {allInstalled ? "Done" : "Turn these on"}
      </button>
    </div>
  );
}

// ── Org gate (a brand-new user has no organization yet) ───────────────────────
function OrgGate({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setPending(true);
    try {
      const org = await createOrganization({ name: name.trim() });
      onCreated(org.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create your account.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Welcome to <ProductName /></h1>
          <p className="text-sm text-muted-foreground mt-1">First, what's your business called? You can change it later.</p>
        </div>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Northshore Roofing" autoFocus onKeyDown={(e) => { if (e.key === "Enter") void create(); }} />
        <button className={cn(primaryBtn, "w-full")} disabled={!name.trim() || pending} onClick={() => void create()}>
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Continue
        </button>
      </div>
    </div>
  );
}

// ── Wizard shell ──────────────────────────────────────────────────────────────
function SelfServeWizard() {
  const navigate = useNavigate();
  const brand = useBrand();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { organizationId, setOrganizationId } = useOrg();
  // Deep links (`/onboarding?step=phone&org=<orgId>`) from done-for-you setup reminders, the
  // forwarding-test SMS and the dashboard setup card: switch to that org (only one the user belongs to) and open the step.
  const requestedOrg = searchParams.get("org");
  const requestedStep = searchParams.get("step");
  useEffect(() => {
    if (!requestedOrg || requestedOrg === organizationId) return;
    if ((session?.organizations ?? []).some((o) => o.id === requestedOrg)) setOrganizationId(requestedOrg);
  }, [requestedOrg, organizationId, session, setOrganizationId]);
  const { data: progress, isLoading } = useOnboardingProgress(organizationId);
  const upsertStep = useUpsertOnboardingStep(organizationId);
  const [active, setActive] = useState<StepKey | null>(null);

  const company = progress?.company ?? null;
  const dataByStep = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    for (const s of progress?.steps ?? []) m.set(s.step, (s.data ?? {}) as Record<string, unknown>);
    return m;
  }, [progress]);

  // The owner sees two groups: the essentials the AI can't work without, and extras for later.
  const steps = useMemo(() => progress?.steps ?? [], [progress]);
  const phoneMode = phoneModeOf(steps);
  const groups = useMemo(() => wizardGroups(phoneMode), [phoneMode]);
  const summary = useMemo(() => setupSummary(steps), [steps]);
  const stateOf = (key: string) => steps.find((s) => s.step === key);

  // Resume where they left off: a linked step, else the first essential still to do, else the
  // server's next step, else the first extra never done. ("Test call" lives in Phone on one number.)
  useEffect(() => {
    if (active !== null || !progress) return;
    if (requestedOrg && requestedOrg !== organizationId && (session?.organizations ?? []).some((o) => o.id === requestedOrg)) return;
    const linked = resolveWizardStep(requestedStep, phoneMode);
    if (linked) {
      setActive(linked);
      return;
    }
    const hint = resolveWizardStep(progress.nextStep, phoneMode);
    setActive(summary.nextEssential ?? hint ?? summary.extrasLeft[0] ?? groups.essentials[0]);
  }, [progress, active, requestedStep, requestedOrg, organizationId, session, phoneMode, summary, groups]);

  const finish = (step: StepKey, skipped: boolean) => {
    if (company) {
      // Only steps whose data the client owns carry the flag (the Phone step's is server-owned).
      const flag = step === "phone" ? {} : skipped ? { data: { ...(dataByStep.get(step) ?? {}), skipped: true } } : isStepSkipped(stateOf(step)) ? { data: { ...(dataByStep.get(step) ?? {}), skipped: false } } : {};
      upsertStep.mutate({ companyId: company.id, step, completed: true, ...flag });
    }
    // On to the next step of the same group; the end of a group is the end of the sitting.
    const group: StepKey[] = (groups.essentials as StepKey[]).includes(step) ? groups.essentials : groups.extras;
    const next = group[group.indexOf(step) + 1];
    if (next) {
      setActive(next);
      return;
    }
    if (group === groups.essentials) toast.success("That's the essentials. Payments, website leads and your team can wait until you want them.");
    navigate("/");
  };

  if (!organizationId) {
    return <OrgGate onCreated={(id) => setOrganizationId(id)} />;
  }

  if (isLoading || active === null) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const stepProps: StepProps = {
    orgId: organizationId,
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    profile: company?.profile ?? null,
    stepData: dataByStep.get(active) ?? {},
    onDone: () => finish(active, false),
    onSkip: () => finish(active, true),
  };
  const needsCompany = active !== "business" && !company;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Set up {brand.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isDoneForYouBrand(brand)
                ? "Four things and your phone is covered. Everything else can wait."
                : "Four things and your AI is working. Everything else can wait."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HelpButton />
            {summary.essentialsDone && (
              <button className={primaryBtn} onClick={() => navigate("/")}>Go to Home <ArrowRight className="w-4 h-4" /></button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
          {/* Step rail: the essentials, numbered; then the extras, never counted as unfinished. */}
          <nav className="space-y-1" aria-label="Setup steps">
            {([
              { title: "Essentials", keys: groups.essentials as StepKey[], numbered: true },
              { title: "When you're ready", keys: groups.extras as StepKey[], numbered: false },
            ]).map((group) => (
              <div key={group.title} className="space-y-1">
                <p className="px-3 pt-3 first:pt-0 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{group.title}</p>
                {group.keys.map((key, i) => {
                  const s = STEPS.find((step) => step.key === key)!;
                  const done = isStepDone(stateOf(key));
                  const skipped = isStepSkipped(stateOf(key));
                  const isActive = key === active;
                  return (
                    <button
                      key={key}
                      onClick={() => setActive(key)}
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors",
                        isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50",
                      )}
                    >
                      <span className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold",
                        done ? "bg-emerald-500/20 text-emerald-400" : isActive ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
                        {done ? <Check className="w-3.5 h-3.5" aria-label="Done" /> : group.numbered ? i + 1 : <s.icon className="w-3 h-3" />}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {group.numbered && <s.icon className="w-3.5 h-3.5" />} {s.title}
                        {skipped && <span className="text-[10px] text-muted-foreground/70">· skipped</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Active step */}
          <div className="bg-card border border-border rounded-xl p-6 min-h-[420px]">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              {(() => { const S = STEPS.find((s) => s.key === active)!; return <><S.icon className="w-5 h-5 text-primary" /> {S.title}</>; })()}
            </h2>
            {needsCompany ? (
              <p className="text-sm text-amber-400">Complete the Business step first.</p>
            ) : active === "business" ? (
              <BusinessStep {...stepProps} />
            ) : active === "services" ? (
              <ServicesStep {...stepProps} />
            ) : active === "phone" ? (
              <PhoneModeStep {...stepProps} aiStep={<PhoneStep {...stepProps} />} />
            ) : active === "ai" ? (
              <YourAiStep orgId={stepProps.orgId} companyId={stepProps.companyId} onDone={stepProps.onDone} goTo={(step) => setActive(step)} />
            ) : active === "payments" ? (
              <PaymentsStep {...stepProps} />
            ) : active === "website" ? (
              <WebsiteFormStep orgId={stepProps.orgId} companyId={stepProps.companyId} onDone={stepProps.onDone} onSkip={stepProps.onSkip} advanced={<WebsiteStep {...stepProps} />} />
            ) : active === "test_call" && dataByStep.get("phone")?.mode === "missed_call_catcher" ? (
              // Missed-call catcher: the test call IS the forwarding test (it completes this
              // step server-side when it passes — docs/missed-call-catcher.md).
              <div className="space-y-4 max-w-2xl">
                <ForwardingTestPanel orgId={stepProps.orgId} companyId={stepProps.companyId} onVerified={stepProps.onDone} />
                <button className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={stepProps.onSkip}>Skip for now →</button>
              </div>
            ) : active === "test_call" ? (
              <TestCallStep {...stepProps} phoneNumber={(dataByStep.get("phone")?.phoneNumber as string) ?? null} />
            ) : active === "team" ? (
              <TeamStep {...stepProps} />
            ) : (
              <RecipesStep {...stepProps} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * /onboarding. Done-for-you orgs are set up FOR them (docs/done-for-you.md): they get the
 * "We're setting you up" progress view instead of the wizard. Everyone else (self-serve
 * signups, house orgs, an account with no org yet) keeps the wizard.
 */
export default function OnboardingWizard() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { organizationId, setOrganizationId } = useOrg();
  const requestedOrg = searchParams.get("org");
  useEffect(() => {
    if (!requestedOrg || requestedOrg === organizationId) return;
    if ((session?.organizations ?? []).some((o) => o.id === requestedOrg)) setOrganizationId(requestedOrg);
  }, [requestedOrg, organizationId, session, setOrganizationId]);
  const switching = Boolean(requestedOrg && requestedOrg !== organizationId && (session?.organizations ?? []).some((o) => o.id === requestedOrg));
  const { data: setupProgress, isLoading, isError } = useSetupProgress(switching ? null : organizationId);

  if (organizationId && !isError && (switching || isLoading)) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (organizationId && setupProgress) return <SetupProgressScreen view={setupProgress} />;
  return <SelfServeWizard />;
}
