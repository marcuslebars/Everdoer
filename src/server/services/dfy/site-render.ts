import { resolveSiteTheme, type SiteThemeId } from "@/lib/site-style";
import { smsConsentText } from "@/server/services/lead-intake/public-form-envelope";

import {
  effectiveCopy,
  effectiveSteps,
  heroPhoto,
  type SiteSectionId,
  hexColor,
  tradeProfile,
  type SiteContent,
  type SiteFacts,
  type SiteService,
} from "./site-content";
import { sitePages, sitePageUrl, siteTowns, tradeNoun, type SiteAreaPage, type SitePage, type SiteServicePage } from "./site-pages";

/**
 * Generated sites — the HTML renderer (docs/done-for-you.md → "Generated sites").
 *
 * One complete, self-contained HTML document: inline CSS, one variable Google font (Archivo,
 * whose width axis gives the truck-door lettering), a few hundred bytes of inline JS for the
 * quote form. No framework, so it is fast on a phone on a job site.
 *
 * Design: the page reads like the contractor's truck door and counter price sheet — the name
 * set wide and heavy, the phone number big enough to tap, and services as a ruled rate sheet
 * with tabular prices. Colour comes from the brand (or a palette per trade), used in one place
 * with conviction (the hero band or rail) plus the call-to-action.
 *
 * SAFETY: every company/owner/model string goes through esc(); URLs through safeHref()
 * (http/https only); colours through hexColor(); JSON-LD through jsonForScript(). Nothing
 * from content is ever placed in a <script> except via jsonForScript.
 */

export interface SiteRenderOptions {
  /** Canonical public URL of the page. */
  url: string;
  /** Active public form key for the quote form; null → no form (call-only). */
  formKey: string | null;
  /** Live booking page URL when online booking is on. */
  bookingUrl: string | null;
  turnstileSiteKey: string | null;
  /** Owner preview from Settings: a banner + noindex. */
  preview?: boolean;
  /** Link for the small "Powered by Everdoer" credit (done-for-you orgs only); null hides it. */
  creditUrl?: string | null;
  /** The browser-tab icon the owner uploaded; falls back to the logo. */
  faviconUrl?: string | null;
  /**
   * Served on the business's own domain: the quote form is the app's embeddable form (an iframe
   * from this origin), because the bot check only runs on our own hosts. Null → inline form.
   */
  embedFormOrigin?: string | null;
  /**
   * Where links to the site's own pages go (null = the home page). Defaults to the public
   * address; the owner preview points them at the preview instead.
   */
  pageHref?: (path: string | null) => string;
  /**
   * Visit and call-tap counting (site stats): the beacon URL on the app and the site's slug.
   * Null/absent (and always in the owner preview) → no counting script.
   */
  stats?: { endpoint: string; slug: string } | null;
  /**
   * Live Google reviews (fetched by the visitor's browser when the section scrolls into view;
   * never stored). Null/absent → the section keeps just the rating and the link.
   */
  reviews?: { endpoint: string; slug: string } | null;
}

// ── Escaping ─────────────────────────────────────────────────────────────────

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** http(s) URLs only (escaped for an attribute); anything else → null. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return esc(url.toString());
  } catch {
    return null;
  }
}

/** JSON safe to embed inside <script type="application/ld+json">. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function telHref(e164: string | null): string | null {
  if (!e164) return null;
  const digits = e164.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

// ── Colour ───────────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function onColor(hex: string): string {
  return luminance(hex) > 0.3 ? "#111820" : "#ffffff";
}

function mix(hex: string, withHex: string, amount: number): string {
  const a = hex.replace("#", "");
  const b = withHex.replace("#", "");
  const out = [0, 2, 4].map((i) => {
    const v = Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount);
    return v.toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

export interface SiteTheme {
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  primarySoft: string;
  primaryDeep: string;
  variant: "bold" | "plain";
}

export function siteTheme(facts: SiteFacts, ownerColor: string | null = null): SiteTheme {
  const trade = tradeProfile(facts.tradeId);
  const primary = hexColor(ownerColor) ?? hexColor(facts.primaryColor) ?? trade.primary;
  let accent = hexColor(facts.accentColor) ?? trade.accent;
  if (accent === primary) accent = trade.accent === primary ? "#e07a1f" : trade.accent;
  return {
    primary,
    onPrimary: onColor(primary),
    accent,
    onAccent: onColor(accent),
    primarySoft: mix(primary, "#ffffff", 0.9),
    primaryDeep: mix(primary, "#000000", 0.25),
    variant: trade.variant,
  };
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────

/** LocalBusiness (or the trade's subtype). Deliberately NO aggregateRating (self-serving review markup). */
export function buildJsonLd(content: SiteContent, opts: Pick<SiteRenderOptions, "url">): Record<string, unknown> {
  const f = content.facts;
  const copy = effectiveCopy(content);
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": tradeProfile(f.tradeId).schemaType,
    name: f.name,
    url: opts.url,
    description: copy.about,
  };
  if (f.phoneE164) ld.telephone = f.phoneE164;
  if (f.serviceArea) ld.areaServed = f.serviceArea;
  if (f.address) ld.address = f.address;
  if (f.logoUrl) {
    ld.logo = f.logoUrl;
    ld.image = f.logoUrl;
  } else if (f.photos[0]) {
    ld.image = f.photos[0];
  }
  if (f.openingHours.length) {
    ld.openingHoursSpecification = f.openingHours.map((s) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: s.days,
      opens: s.opens,
      closes: s.closes,
    }));
  }
  const sameAs = [f.website, f.mapsUrl].filter((u): u is string => Boolean(u));
  if (sameAs.length) ld.sameAs = sameAs;
  return ld;
}

// ── Icons (inline SVG, decorative) ───────────────────────────────────────────

const ICON = {
  phone: '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  pin: '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  clock: '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.3 2-1 1.7L11 13V7h2z"/></svg>',
  star: '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>',
  calendar: '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3zm12 8H5v9h14z"/></svg>',
};

// ── Sections ─────────────────────────────────────────────────────────────────

function ratingBadge(f: SiteFacts, cls: string): string {
  if (!f.rating || !f.reviewCount) return "";
  const href = safeHref(f.reviewUrl) ?? safeHref(f.mapsUrl);
  const label = `${f.rating.toFixed(1)} on Google from ${f.reviewCount} review${f.reviewCount === 1 ? "" : "s"}`;
  const inner = `<span class="stars">${ICON.star}</span><strong>${esc(f.rating.toFixed(1))}</strong><span>from ${esc(f.reviewCount)} Google review${f.reviewCount === 1 ? "" : "s"}</span>`;
  return href
    ? `<a class="${cls}" href="${href}" rel="noopener" target="_blank" aria-label="${esc(label)}">${inner}</a>`
    : `<p class="${cls}" aria-label="${esc(label)}">${inner}</p>`;
}

/** "$65 / visit" → amount + unit (the unit drops to its own line on phones). */
function priceHtml(text: string): string {
  const i = text.indexOf(" / ");
  return i > 0 ? `${esc(text.slice(0, i))}<span class="unit"> / ${esc(text.slice(i + 3))}</span>` : esc(text);
}

function serviceRow(s: SiteService, blurb: string | undefined, showPrices: boolean, hasForm: boolean, href: string | null = null): string {
  const price = showPrices && s.priceText
    ? `<span class="price">${priceHtml(s.priceText)}</span>${s.priceNote ? `<span class="price-note">${esc(s.priceNote)}</span>` : ""}`
    : hasForm
      ? `<a class="quote-link" href="#quote" data-service="${esc(s.label)}">Get a quote</a>`
      : `<span class="quote-text">Call for a price</span>`;
  return `<li class="rate">
  <div class="rate-main"><h3>${href ? `<a href="${esc(href)}">${esc(s.label)}</a>` : esc(s.label)}</h3>${blurb ? `<p>${esc(blurb)}</p>` : ""}</div>
  <div class="rate-price">${price}</div>
</li>`;
}

function hoursBlock(f: SiteFacts): string {
  if (!f.hoursLines.length) return "";
  return `<div class="fact">
  <h3>${ICON.clock}<span>Hours</span></h3>
  <ul class="hours">${f.hoursLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
</div>`;
}

function areaBlock(f: SiteFacts): string {
  if (!f.serviceArea && !f.mapsUrl && !f.address) return "";
  const maps = safeHref(f.mapsUrl);
  return `<div class="fact">
  <h3>${ICON.pin}<span>Where we work</span></h3>
  ${f.serviceArea ? `<p class="fact-big">${esc(f.serviceArea)}</p>` : ""}
  ${f.address ? `<p>${esc(f.address)}</p>` : ""}
  ${maps ? `<p><a href="${maps}" rel="noopener" target="_blank">Find us on Google Maps</a></p>` : ""}
</div>`;
}

function stepsSection(content: SiteContent, opts: SiteRenderOptions): string {
  const tel = telHref(content.facts.phoneE164);
  const stepList = effectiveSteps(content, { phone: Boolean(tel), form: Boolean(opts.formKey), booking: Boolean(safeHref(opts.bookingUrl)) });
  return `<section class="section flow" aria-labelledby="how-title">
  <div class="wrap">
    <div class="section-head"><h2 id="how-title">How it works</h2></div>
    <ol class="steps">
      ${stepList.map((st) => `<li><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p></li>`).join("\n      ")}
    </ol>
  </div>
</section>`;
}

/**
 * Google rating + "Read our Google reviews", and (when set up) a block the visitor's browser
 * fills with the business's latest Google reviews once the section scrolls into view. Google's
 * terms: review text is never stored, the author's name sits with each review, Google Maps is
 * credited, and reviews show as Google returns them (most relevant), never filtered by stars.
 */
function reviewsSection(f: SiteFacts, opts: SiteRenderOptions): string {
  const reviewHref = safeHref(f.reviewUrl) ?? safeHref(f.mapsUrl);
  if (!f.rating || !f.reviewCount) return "";
  const live = opts.reviews && safeHref(opts.reviews.endpoint) ? opts.reviews : null;
  const liveBlock = !live
    ? ""
    : opts.preview
      ? '<p class="gr-note">Your latest Google reviews show here on the live page.</p>'
      : `<div class="gr" data-gr hidden><ul class="gr-list"></ul><p class="gr-attr">Reviews from <span class="gr-g">Google Maps</span>, most relevant first. <a href="https://policies.google.com/privacy" rel="noopener nofollow" target="_blank">Google Privacy Policy</a> · <a href="https://policies.google.com/terms" rel="noopener nofollow" target="_blank">Terms</a></p></div>
<script>${reviewsScript(live)}</script>`;
  return `<section class="section reviews" aria-labelledby="reviews-title">
  <div class="wrap">
    <div class="score">
      <span class="score-num">${esc(f.rating.toFixed(1))}</span>
      <div><div class="score-stars">${ICON.star.repeat(5)}</div><h2 id="reviews-title" style="font-size:1.1rem;font-variation-settings:'wdth' 100">${esc(f.reviewCount)} Google review${f.reviewCount === 1 ? "" : "s"}</h2><p>See what customers wrote, in their own words.</p></div>
    </div>
    ${reviewHref ? `<a class="btn btn-accent" href="${reviewHref}" rel="noopener" target="_blank">Read our Google reviews</a>` : ""}
  </div>
  ${liveBlock ? `<div class="wrap">${liveBlock}</div>` : ""}
</section>`;
}

/** Fetch and draw the live reviews (text only via textContent; links only to https Google). */
function reviewsScript(cfg: { endpoint: string; slug: string }): string {
  return `(function(c){var box=document.querySelector("[data-gr]");if(!box||!window.fetch)return;var done=false;
function go(){if(done)return;done=true;fetch(c.u+"?s="+encodeURIComponent(c.s),{credentials:"omit"}).then(function(r){return r.ok?r.json():null}).then(function(j){var d=j&&j.data;if(!d||!d.reviews||!d.reviews.length)return;var ul=box.querySelector(".gr-list");
var ok=function(u){if(typeof u!=="string")return false;try{var x=new URL(u),h=x.hostname,p=h.split(".");return x.protocol==="https:"&&(p.indexOf("google")>=0&&p[p.length-1]!=="google"||h==="googleusercontent.com"||h.slice(-22)===".googleusercontent.com")}catch(e){return false}};
d.reviews.slice(0,5).forEach(function(v){var li=document.createElement("li");li.className="gr-item";var head=document.createElement("div");head.className="gr-head";
if(ok(v.authorPhoto)){var im=document.createElement("img");im.src=v.authorPhoto;im.alt="";im.width=32;im.height=32;im.loading="lazy";im.referrerPolicy="no-referrer";head.appendChild(im)}
var who=document.createElement(ok(v.authorUrl)?"a":"span");who.className="gr-who";who.textContent=v.author||"A Google user";if(ok(v.authorUrl)){who.href=v.authorUrl;who.rel="noopener nofollow";who.target="_blank"}head.appendChild(who);
var st=document.createElement("span");st.className="gr-stars";var n=Math.max(1,Math.min(5,v.rating|0));st.textContent="\u2605\u2605\u2605\u2605\u2605".slice(0,n)+"\u2606\u2606\u2606\u2606\u2606".slice(0,5-n);st.setAttribute("aria-label",n+" out of 5 stars");head.appendChild(st);
if(v.when){var w=document.createElement("span");w.className="gr-when";w.textContent=v.when;head.appendChild(w)}
var p=document.createElement("p");p.className="gr-text";p.textContent=v.text;li.appendChild(head);li.appendChild(p);ul.appendChild(li)});box.hidden=false}).catch(function(){})}
if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.disconnect();go()}})},{rootMargin:"300px"});io.observe(box.closest("section")||box)}else{go()}})(${jsonForScript({ u: cfg.endpoint, s: cfg.slug })});`;
}

function quoteForm(content: SiteContent, opts: SiteRenderOptions, selected: string | null = null): string {
  const f = content.facts;
  const tel = telHref(f.phoneE164);
  if (!opts.formKey) {
    if (!tel) return "";
    return `<section class="section quote" id="quote" aria-labelledby="quote-title">
  <div class="wrap quote-wrap">
    <div class="quote-intro"><h2 id="quote-title">Get a price</h2><p>Call us and tell us about the job.</p></div>
    <a class="btn btn-accent btn-big" href="${esc(tel)}">${ICON.phone}<span>Call ${esc(f.phoneDisplay)}</span></a>
  </div>
</section>`;
  }
  const embedOrigin = safeHref(opts.embedFormOrigin)?.replace(/\/+$/, "") ?? null;
  if (embedOrigin && !opts.preview) {
    return `<section class="section quote" id="quote" aria-labelledby="quote-title">
  <div class="wrap quote-wrap">
    <div class="quote-intro">
      <h2 id="quote-title">Ask for a quote</h2>
      <p>Tell us what you need and where. We'll get back to you with a price.</p>
      ${tel ? `<p class="quote-call">Rather talk? <a href="${esc(tel)}">Call ${esc(f.phoneDisplay)}</a></p>` : ""}
    </div>
    <div class="form form-embed"><script src="${embedOrigin}/embed/v1.js" data-form="${esc(opts.formKey)}" data-mode="inline" data-label="Ask for a quote" async></script></div>
  </div>
</section>`;
  }
  const options = f.services
    .map((s) => `<option value="${esc(s.label)}"${s.label === selected ? " selected" : ""}>${esc(s.label)}</option>`)
    .join("");
  const endpoint = `/api/public/forms/${encodeURIComponent(opts.formKey)}`;
  const turnstile = opts.turnstileSiteKey
    ? `<div class="cf-turnstile" data-sitekey="${esc(opts.turnstileSiteKey)}"></div>`
    : "";
  return `<section class="section quote" id="quote" aria-labelledby="quote-title">
  <div class="wrap quote-wrap">
    <div class="quote-intro">
      <h2 id="quote-title">Ask for a quote</h2>
      <p>Tell us what you need and where. We'll get back to you with a price.</p>
      ${tel ? `<p class="quote-call">Rather talk? <a href="${esc(tel)}">Call ${esc(f.phoneDisplay)}</a></p>` : ""}
    </div>
    <form class="form" id="quote-form" data-endpoint="${esc(endpoint)}"${opts.preview ? ' data-preview="1"' : ""} novalidate>
      <div class="field"><label for="q-name">Your name</label><input id="q-name" name="name" autocomplete="name" maxlength="200"></div>
      <div class="field-row">
        <div class="field"><label for="q-phone">Phone</label><input id="q-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40"></div>
        <div class="field"><label for="q-email">Email</label><input id="q-email" name="email" type="email" autocomplete="email" maxlength="320"></div>
      </div>
      ${f.services.length ? `<div class="field"><label for="q-service">What do you need?</label><select id="q-service" name="service"><option value="">Choose a service</option>${options}<option value="Something else">Something else</option></select></div>` : ""}
      <div class="field"><label for="q-message">Details</label><textarea id="q-message" name="message" rows="4" maxlength="4000" placeholder="Address, size of the job, timing"></textarea></div>
      <div class="hp" aria-hidden="true"><label for="q-website">Leave this empty</label><input id="q-website" name="website" tabindex="-1" autocomplete="off"></div>
      <label class="consent"><input type="checkbox" name="smsConsent" value="1"><span>${esc(smsConsentText(f.name))}</span></label>
      ${turnstile}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-accent btn-big" type="submit">Send my request</button>
      <p class="form-hint">We need a phone number or an email to reach you.</p>
    </form>
    <div class="form-done" hidden role="status" tabindex="-1"><h3>Thanks, we got it.</h3><p>We'll be in touch soon${tel ? `. If it's urgent, call <a href="${esc(tel)}">${esc(f.phoneDisplay)}</a>` : ""}.</p></div>
  </div>
</section>`;
}

const FORM_JS = `(function(){var f=document.getElementById("quote-form");if(!f)return;var t0=Date.now();
document.querySelectorAll("[data-service]").forEach(function(a){a.addEventListener("click",function(){var s=document.getElementById("q-service");if(s)s.value=a.getAttribute("data-service")||"";});});
f.addEventListener("submit",function(e){e.preventDefault();var err=f.querySelector(".form-error"),b=f.querySelector("button[type=submit]");var v=function(n){var el=f.elements[n];return el&&el.value?el.value.trim():"";};
if(f.getAttribute("data-preview")){err.textContent="This is a preview. The form sends requests once the page is published.";err.hidden=false;return;}var phone=v("phone"),email=v("email");if(!phone&&!email){err.textContent="Please enter a phone number or an email so we can reach you.";err.hidden=false;return;}
var q=new URLSearchParams(location.search),utm={};["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"].forEach(function(k){var x=q.get(k);if(x)utm[k]=x.slice(0,200);});
var ts=f.querySelector("[name=cf-turnstile-response]");var body={name:v("name")||undefined,phone:phone||undefined,email:email||undefined,service:v("service")||undefined,message:v("message")||undefined,smsConsent:phone?f.elements.smsConsent.checked:undefined,page:location.href.slice(0,2000),utm:Object.keys(utm).length?utm:undefined,website:v("website")||undefined,formStartedAt:t0,turnstileToken:ts&&ts.value?ts.value:undefined};
b.disabled=true;b.textContent="Sending…";err.hidden=true;
fetch(f.getAttribute("data-endpoint"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(!r.ok)throw new Error(j&&j.error||"Couldn't send. Please try again.");});})
.then(function(){f.hidden=true;var d=document.querySelector(".form-done");d.hidden=false;d.focus();})
.catch(function(x){err.textContent=x.message||"Couldn't send. Please try again.";err.hidden=false;b.disabled=false;b.textContent="Send my request";});});})();`;

// ── CSS ──────────────────────────────────────────────────────────────────────

function css(t: SiteTheme): string {
  return `:root{--ink:#15202a;--ink-2:#46525e;--paper:#f2f4f6;--card:#fff;--rule:#d7dde3;--p:${t.primary};--on-p:${t.onPrimary};--p-soft:${t.primarySoft};--p-deep:${t.primaryDeep};--a:${t.accent};--on-a:${t.onAccent};
--wide:"wdth" 118;--narrow:"wdth" 82}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.55 Archivo,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variation-settings:"wdth" 100}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
a{color:var(--p-deep)}a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--a);outline-offset:2px}
img{max-width:100%;display:block}
h1,h2,h3{line-height:1.08;margin:0;font-weight:800}
h2{font-size:clamp(1.6rem,4.6vw,2.3rem);font-variation-settings:var(--wide);letter-spacing:-.01em}
.wrap{width:100%;max-width:1080px;margin:0 auto;padding:0 20px}
.skip{position:absolute;left:-999px}.skip:focus{left:12px;top:12px;background:#fff;padding:8px 12px;z-index:50}
.gallery{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.gallery li{aspect-ratio:4/3;overflow:hidden;border-radius:10px;background:var(--rule)}
.gallery img{width:100%;height:100%;object-fit:cover}
.form-embed{min-height:420px}
.preview{background:#fff4c2;color:#4a3b00;text-align:center;font-size:14px;padding:8px 12px;border-bottom:1px solid #e9d27a}
/* top bar */
.top{background:var(--card);border-bottom:1px solid var(--rule)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--ink);min-width:0}
.brand img{max-height:44px;width:auto;max-width:180px;object-fit:contain}
.wordmark{font-weight:900;font-size:1.15rem;font-variation-settings:var(--wide);letter-spacing:-.01em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top-links{display:flex;align-items:center;gap:18px;font-weight:600;font-size:15px}
.top-links a{text-decoration:none;color:var(--ink)}.top-links a:hover{color:var(--p-deep)}
.top-phone{display:none;align-items:center;gap:8px;font-variant-numeric:tabular-nums}
/* hero */
.hero{position:relative;padding:44px 0 40px}
.hero.bold{background:var(--p);color:var(--on-p)}
.hero.plain{background:var(--card);border-bottom:1px solid var(--rule)}
.hero.plain::before{content:"";position:absolute;left:0;top:0;bottom:0;width:8px;background:var(--p)}
.hero-grid{display:grid;gap:28px}
.hero-name{margin:0 0 14px;font-weight:700;font-size:15px;font-variation-settings:var(--wide);opacity:.85}
.hero h1{font-size:clamp(2.1rem,8.4vw,3.9rem);font-weight:900;font-variation-settings:"wdth" 112;letter-spacing:-.02em;max-width:17ch;text-wrap:balance}
.hero.plain h1{color:var(--ink)}
.sub{font-size:clamp(1.05rem,2.6vw,1.25rem);margin:16px 0 0;max-width:38em;opacity:.92}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 22px;border-radius:6px;font:inherit;font-weight:700;font-size:17px;text-decoration:none;border:2px solid transparent;cursor:pointer;line-height:1.1}
.btn-accent{background:var(--a);color:var(--on-a)}.btn-accent:hover{filter:brightness(1.06)}
.btn-ghost{border-color:currentColor;color:inherit;background:transparent}
.hero.plain .btn-ghost{color:var(--ink)}
.btn-big{min-height:58px;font-size:18px}
.btn[disabled]{opacity:.6;cursor:progress}
.phone-num{font-variant-numeric:tabular-nums;font-variation-settings:"wdth" 108;letter-spacing:.01em}
.rating{display:inline-flex;align-items:center;gap:8px;margin:22px 0 0;font-size:15px;color:inherit;text-decoration:none;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28)}
.hero.plain .rating{background:var(--p-soft);border-color:transparent;color:var(--ink)}
.rating .stars{color:#f5b400;display:inline-flex}
.rating strong{font-size:16px}
a.rating:hover span:last-child{text-decoration:underline}
.door{display:none;background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:22px}
.hero.plain .door{background:var(--paper);border-color:var(--rule)}
.door h2{font-size:15px;font-weight:700;font-variation-settings:"wdth" 100;letter-spacing:0;opacity:.8;margin-bottom:8px}
.door .big-phone{display:block;font-size:clamp(1.8rem,5vw,2.4rem);font-weight:900;color:inherit;text-decoration:none;font-variant-numeric:tabular-nums;font-variation-settings:"wdth" 110}
.door ul{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:10px;font-size:15px}
.door li{display:flex;gap:10px;align-items:flex-start}.door li svg{flex:none;margin-top:2px;opacity:.85}
.hero-photo{border-radius:10px;overflow:hidden;aspect-ratio:4/3;background:var(--p-deep)}
.hero-photo img{width:100%;height:100%;object-fit:cover}
/* sections */
.section{padding:56px 0}.flow+.flow{padding-top:0}
.section-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 20px;margin-bottom:22px}
.section-head p{margin:0;color:var(--ink-2)}
/* rate sheet */
.sheet{background:var(--card);border:1px solid var(--rule);border-top:6px solid var(--p);border-radius:4px;padding:6px 0;margin:0;list-style:none}
.rate{display:grid;grid-template-columns:1fr auto;gap:6px 18px;align-items:baseline;padding:16px 20px;border-bottom:1px dashed var(--rule)}
.rate:last-child{border-bottom:0}
.rate h3{font-size:1.06rem;font-weight:700;font-variation-settings:"wdth" 100;line-height:1.3}
.rate p{margin:4px 0 0;color:var(--ink-2);font-size:15px;line-height:1.45}
.rate-price{text-align:right;display:flex;flex-direction:column;align-items:flex-end}
.price{font-weight:800;font-size:1.12rem;font-variant-numeric:tabular-nums;white-space:nowrap;font-variation-settings:"wdth" 104}.price .unit{display:block;font-weight:500;font-size:13px;color:var(--ink-2);font-variation-settings:"wdth" 100}
.price-note{font-size:13px;color:var(--ink-2);white-space:nowrap}
.quote-link{font-weight:700;font-size:15px;white-space:nowrap;color:var(--p-deep)}
.quote-text{font-size:15px;color:var(--ink-2);white-space:nowrap}
.sheet-foot{margin:14px 2px 0;font-size:15px;color:var(--ink-2)}
/* steps */
.steps{list-style:none;margin:0;padding:0;display:grid;gap:14px;counter-reset:s}
.steps li{counter-increment:s;background:var(--card);border:1px solid var(--rule);border-radius:6px;padding:18px 18px 18px 64px;position:relative}
.steps li::before{content:counter(s);position:absolute;left:18px;top:16px;width:32px;height:32px;border-radius:50%;background:var(--p);color:var(--on-p);font-weight:800;display:grid;place-items:center;font-size:16px}
.steps h3{font-size:1.05rem;font-variation-settings:"wdth" 100;margin-bottom:4px}
.steps p{margin:0;color:var(--ink-2);font-size:15px}
/* about + facts */
.about{display:grid;gap:28px}
.about-copy p{margin:14px 0 0;font-size:1.08rem;max-width:36em}
.highlights{margin:18px 0 0;padding:0;list-style:none;display:grid;gap:8px}
.highlights li{padding-left:22px;position:relative}.highlights li::before{content:"";position:absolute;left:0;top:.6em;width:10px;height:4px;background:var(--a)}
.facts{display:grid;gap:14px}
.fact{background:var(--card);border:1px solid var(--rule);border-radius:6px;padding:18px 20px}
.fact h3{display:flex;align-items:center;gap:8px;font-size:15px;font-variation-settings:"wdth" 100;color:var(--p-deep);margin-bottom:8px}
.fact p{margin:6px 0 0}.fact-big{font-weight:700;font-size:1.1rem}
.hours{list-style:none;margin:0;padding:0;font-variant-numeric:tabular-nums}.hours li{padding:3px 0}
/* reviews */
.reviews{background:var(--p-soft)}
.reviews .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}
.score{display:flex;align-items:center;gap:16px}
.score-num{font-size:3.4rem;font-weight:900;font-variation-settings:"wdth" 112;line-height:1;color:var(--p-deep)}
.score-stars{color:#f5b400;display:flex;gap:2px}.score-stars svg{width:22px;height:22px}
.score p{margin:4px 0 0;color:var(--ink-2)}
/* faq */
.faq>*{max-width:760px}
.faq details{border-bottom:1px solid var(--rule)}
.faq summary{cursor:pointer;list-style:none;padding:18px 36px 18px 0;font-weight:700;font-size:1.06rem;position:relative}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"";position:absolute;right:6px;top:50%;width:10px;height:10px;border-right:2.5px solid var(--p);border-bottom:2.5px solid var(--p);transform:translateY(-70%) rotate(45deg);transition:transform .15s}
.faq details[open] summary::after{transform:translateY(-30%) rotate(-135deg)}
.faq details p{margin:0 0 18px;color:var(--ink-2);max-width:40em}
/* quote */
.quote{background:var(--card);border-top:1px solid var(--rule)}
.quote-wrap{display:grid;gap:28px}
.quote-intro p{margin:12px 0 0;color:var(--ink-2);max-width:30em}
.quote-call{font-weight:600}
.form{display:grid;gap:16px;max-width:620px}
.field{display:grid;gap:6px}.field-row{display:grid;gap:16px}
.field label{font-weight:600;font-size:15px}
input,select,textarea{font:inherit;font-size:16px;width:100%;padding:12px 14px;border:1.5px solid #b9c3cc;border-radius:6px;background:#fff;color:var(--ink)}
input:focus,select:focus,textarea:focus{border-color:var(--p);outline:3px solid var(--p-soft);outline-offset:0}
.hp{position:absolute;left:-5000px;width:1px;height:1px;overflow:hidden}
.consent{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--ink-2);line-height:1.45}
.consent input{width:18px;height:18px;margin-top:2px;flex:none}
.form-error{margin:0;color:#b42318;font-weight:600}
.form-hint{margin:-4px 0 0;font-size:14px;color:var(--ink-2)}
.form-done{background:var(--p-soft);border-radius:8px;padding:24px;max-width:620px}.form-done p{margin:8px 0 0}
/* footer */
.foot{background:var(--p-deep);color:#fff;padding:36px 0 110px;font-size:15px}
.foot a{color:#fff}
.foot .wrap{display:grid;gap:14px}
.foot-name{font-weight:900;font-size:1.2rem;font-variation-settings:var(--wide)}
.foot p{margin:0;opacity:.88}
.credit{font-size:13px;opacity:.7}
.gr{margin-top:24px}.gr-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.gr-item{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:16px;color:var(--ink)}
.gr-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-bottom:8px;font-size:14px}
.gr-head img{border-radius:50%}.gr-who{font-weight:700;color:inherit}.gr-stars{color:#f5a623;letter-spacing:1px}.gr-when{color:var(--ink-2);font-size:13px}
.gr-text{margin:0;font-size:15px;display:-webkit-box;-webkit-line-clamp:7;-webkit-box-orient:vertical;overflow:hidden}
.gr-attr{margin:12px 0 0;font-size:12px;opacity:.8}.gr-attr a{color:inherit}.gr-g{font-family:Roboto,Arial,sans-serif;font-weight:500}
.gr-note{margin:16px 0 0;font-size:14px;opacity:.8}
.foot-areas{grid-column:1/-1}.foot-areas ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 18px}
.crumbs{font-size:14px;margin:0 0 12px;opacity:.85}.crumbs a{color:inherit}
.rate-main h3 a{color:inherit;text-decoration:none}.rate-main h3 a:hover{text-decoration:underline}
.links{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.links a{display:block;background:var(--card);border:1px solid var(--rule);border-radius:8px;padding:12px 14px;font-weight:600;text-decoration:none;color:var(--ink)}
.links a:hover{border-color:var(--p)}
/* sticky mobile bar */
.bar{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);border-top:1px solid var(--rule);box-shadow:0 -6px 20px rgba(16,24,32,.08)}
.bar .btn{flex:1;min-height:50px;font-size:16px;padding:0 12px}
.bar .btn-call{background:var(--p);color:var(--on-p)}
@media (min-width:700px){
  .field-row{grid-template-columns:1fr 1fr}
  .steps{grid-template-columns:repeat(3,1fr)}
  .facts{grid-template-columns:1fr 1fr}
}
@media (min-width:900px){
  body{font-size:18px}
  .top-phone{display:inline-flex}
  .door{display:block}
  .price .unit{display:inline;font-size:inherit;font-weight:inherit;color:inherit}
  .hero{padding:72px 0 68px}
  .hero-grid{grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);align-items:center;gap:56px}
  .section{padding:80px 0}
  .about{grid-template-columns:1.3fr 1fr;align-items:start;gap:56px}
  .facts{grid-template-columns:1fr}
  .about-facts{grid-template-columns:1fr;gap:22px}.about-facts .facts{grid-template-columns:1fr 1fr}
  .quote-wrap{grid-template-columns:1fr 1.4fr;gap:56px}
  .bar{display:none}
  .foot{padding-bottom:40px}
  .foot .wrap{grid-template-columns:1fr auto;align-items:end}
}`;
}

// ── Looks ────────────────────────────────────────────────────────────────────
// The base CSS above is "Bold" (wide Archivo, the rate sheet, the colour band). "Clean" and
// "Classic" layer over it: fonts, colour use, the hero, and how services, steps and reviews are
// laid out. Same markup in every look, so every look keeps the form, call bar and SEO data.

const LOOK_FONTS: Record<SiteThemeId, string> = {
  bold: "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap",
  clean: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
  classic: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Instrument+Sans:wght@400;500;600;700&display=swap",
};

export function lookCss(look: SiteThemeId): string {
  if (look === "clean") return CLEAN_CSS;
  if (look === "classic") return CLASSIC_CSS;
  return BOLD_CSS;
}

/** Bold sets a short headline in capitals (truck-door lettering); a long one stays in normal case. */
const BOLD_CAPS_MAX = 48;

const BOLD_CSS = `
.look-bold .hero h1.caps{text-transform:uppercase;font-variation-settings:"wdth" 122;letter-spacing:-.005em;line-height:1}
.look-bold .hero h1:not(.caps){font-size:clamp(2rem,6.6vw,3.4rem);max-width:20ch}
.look-bold h2{text-transform:uppercase}
.look-bold .steps li{border-top:6px solid var(--a)}`;

const CLEAN_CSS = `
.look-clean{--paper:#ffffff;--rule:#e2e8f0;--ink:#0f172a;--ink-2:#475569}
body.look-clean{font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variation-settings:normal;background:#fff}
.look-clean h1,.look-clean h2,.look-clean h3,.look-clean .wordmark,.look-clean .foot-name,.look-clean .price,.look-clean .score-num,.look-clean .phone-num,.look-clean .door .big-phone{font-variation-settings:normal}
.look-clean h2{letter-spacing:-.02em;font-weight:800}
.look-clean .btn{border-radius:999px}
.look-clean .btn-accent{background:var(--p);color:var(--on-p)}
.look-clean .top{border-bottom:1px solid var(--rule)}
.look-clean .hero.clean{background:var(--p-soft);border-bottom:0}
.look-clean .hero.clean h1{color:var(--ink);letter-spacing:-.03em;font-weight:800;max-width:18ch}
.look-clean .hero.clean .sub{color:var(--ink-2);opacity:1}
.look-clean .hero.clean .btn-ghost{color:var(--ink);border-color:#cbd5e1;background:#fff}
.look-clean .hero.clean .rating{background:#fff;border:1px solid var(--rule);color:var(--ink)}
.look-clean .hero-photo{border-radius:24px}
.look-clean .door{background:#fff;border:1px solid var(--rule);border-radius:20px;color:var(--ink);box-shadow:0 12px 32px rgba(15,23,42,.08)}
.look-clean .sheet{list-style:none;padding:0;background:none;border:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.look-clean .rate{display:flex;flex-direction:column;justify-content:space-between;gap:14px;background:#fff;border:1px solid var(--rule);border-radius:18px;padding:22px}
.look-clean .rate:last-child{border-bottom:1px solid var(--rule)}
.look-clean .rate h3{font-size:1.12rem}
.look-clean .rate-price{align-items:flex-start;text-align:left}
.look-clean .price{color:var(--p)}
.look-clean .steps li{border-radius:18px;background:#f8fafc;border:0;padding:22px 22px 22px 70px}
.look-clean .steps li::before{border-radius:12px}
.look-clean .fact{border-radius:18px}
.look-clean .reviews{background:#f8fafc}
.look-clean .gallery li{border-radius:18px}
.look-clean .quote{background:#fff;border-top:0}
.look-clean .quote-wrap{background:#0f172a;color:#fff;border-radius:28px;padding:32px 24px}
.look-clean .quote-intro p{color:#cbd5e1}
.look-clean .quote-intro a{color:#fff}
.look-clean .form{background:#fff;color:var(--ink);border-radius:20px;padding:22px}
.look-clean input,.look-clean select,.look-clean textarea{border-radius:12px;border:1px solid #cbd5e1}
.look-clean .form-done{color:var(--ink)}
.look-clean .foot{background:#fff;color:var(--ink-2);border-top:1px solid var(--rule)}
.look-clean .foot a{color:var(--ink)}
.look-clean .foot-name{color:var(--ink)}
.look-clean .bar .btn-call{background:#fff;color:var(--ink);border:1px solid #cbd5e1}
@media (min-width:900px){.look-clean .quote-wrap{padding:48px}}`;

const CLASSIC_CSS = `
.look-classic{--paper:#f3f1ec;--rule:#cfc9bc;--ink:#1c1f1d;--ink-2:#4a504b}
body.look-classic{font-family:"Instrument Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variation-settings:normal;background:var(--paper)}
.look-classic h1,.look-classic h2,.look-classic h3,.look-classic .wordmark,.look-classic .foot-name,.look-classic .score-num{font-family:Fraunces,Georgia,serif;font-variation-settings:normal;font-optical-sizing:auto;font-weight:400;letter-spacing:-.015em}
.look-classic .price,.look-classic .phone-num,.look-classic .door .big-phone{font-variation-settings:normal}
.look-classic h2{font-size:clamp(1.9rem,5vw,3rem)}
.look-classic .btn{border-radius:2px;font-weight:600}
.look-classic .top{background:var(--paper);border-bottom:1px solid var(--rule)}
.look-classic .hero.classic{position:relative;background:var(--p);color:var(--on-p);overflow:hidden}
.look-classic .hero.classic.has-photo{min-height:min(78vh,720px);display:flex;align-items:flex-end;color:#fff;padding-top:120px}
.look-classic .hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.look-classic .hero.classic.has-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,20,17,.05) 30%,rgba(15,20,17,.72))}
.look-classic .hero.classic .wrap{position:relative;z-index:1}
.look-classic .hero.classic h1{font-size:clamp(2.4rem,8vw,5rem);line-height:1;max-width:16ch}
.look-classic .kicker{margin:0 0 16px;font-size:13px;letter-spacing:.18em;text-transform:uppercase;opacity:.85}
.look-classic .hero.classic .rating{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.35)}
.look-classic .door{background:rgba(0,0,0,.14);border-color:rgba(255,255,255,.2);border-radius:2px}
.look-classic .sheet{list-style:none;padding:0;margin:0;background:none;border:0;border-radius:0;counter-reset:svc}
.look-classic .rate{counter-increment:svc;grid-template-columns:44px 1fr auto;padding:26px 0;border-bottom:0;border-top:1px solid var(--rule)}
.look-classic .rate:last-child{border-bottom:1px solid var(--rule)}
.look-classic .rate::before{content:counter(svc,decimal-leading-zero);font-family:Fraunces,Georgia,serif;font-size:1.05rem;color:var(--ink-2)}
.look-classic .rate h3{font-size:clamp(1.3rem,3vw,1.7rem);font-weight:500}
.look-classic .steps li{background:none;border:0;border-top:1px solid var(--rule);border-radius:0;padding:22px 0 0}
.look-classic .steps li::before{position:static;display:block;width:auto;height:auto;background:none;color:var(--ink-2);font-family:Fraunces,Georgia,serif;font-weight:400;font-size:1rem;margin-bottom:10px;content:"0" counter(s)}
.look-classic .steps h3{font-size:1.35rem}
.look-classic .fact{background:none;border:0;border-top:1px solid var(--rule);border-radius:0;padding:18px 0}
.look-classic .fact h3{font-family:"Instrument Sans",system-ui,sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2)}
.look-classic .gallery{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.look-classic .gallery li{border-radius:0;aspect-ratio:4/5}
.look-classic .reviews{background:var(--p);color:var(--on-p)}
.look-classic .reviews .score-num{color:inherit}
.look-classic .reviews .score p{color:inherit;opacity:.8}
.look-classic .faq summary{font-family:Fraunces,Georgia,serif;font-weight:500;font-size:1.2rem}
.look-classic .quote{background:var(--paper);border-top:1px solid var(--rule)}
.look-classic input,.look-classic select,.look-classic textarea{border:0;border-bottom:1.5px solid #8b8678;border-radius:0;background:transparent;padding:12px 2px}
.look-classic .form-done{border-radius:2px}
.look-classic .foot{background:var(--p);color:var(--on-p)}
.look-classic .foot a{color:inherit}
.look-classic .hero .btn-accent,.look-classic .reviews .btn-accent{background:#f3f1ec;color:#1c1f1d}
.look-classic .form .btn-accent,.look-classic .quote-wrap>.btn-accent,.look-classic .bar .btn-accent{background:var(--p);color:var(--on-p)}
.look-classic .bar .btn-call{background:transparent;color:var(--ink);border-color:var(--ink)}
.look-classic .highlights li::before{background:var(--p)}`;

// ── Page ─────────────────────────────────────────────────────────────────────

interface PageMeta {
  title: string;
  description: string;
  /** This page's own address (canonical + og:url). */
  url: string;
  /** JSON-LD blocks for this page. */
  jsonLd: unknown[];
}

function homeMeta(content: SiteContent, opts: SiteRenderOptions): PageMeta {
  const f = content.facts;
  const copy = effectiveCopy(content);
  const trade = f.tradeId ? tradeProfile(f.tradeId).noun : null;
  const titleBits = [f.name, content.mode === "price_page" ? "Services and prices" : trade && f.serviceArea ? `${trade} in ${f.serviceArea}` : trade ?? f.serviceArea];
  return {
    title: titleBits.filter(Boolean).join(" | ").slice(0, 120),
    description: (copy.subhead.length >= 60 ? copy.subhead : `${copy.subhead} ${copy.about}`).slice(0, 300),
    url: opts.url,
    jsonLd: [buildJsonLd(content, opts)],
  };
}

function head(content: SiteContent, opts: SiteRenderOptions, theme: SiteTheme, look: SiteThemeId, meta: PageMeta = homeMeta(content, opts)): string {
  const f = content.facts;
  const { title, description } = meta;
  const image = safeHref(f.photos[0]) ?? safeHref(f.logoUrl);
  const canonical = safeHref(meta.url);
  const icon = safeHref(opts.faviconUrl) ?? safeHref(f.logoUrl);
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${canonical}">` : ""}
${opts.preview ? '<meta name="robots" content="noindex,nofollow">' : ""}
<meta name="theme-color" content="${esc(theme.primary)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${canonical ? `<meta property="og:url" content="${canonical}">` : ""}
<meta property="og:site_name" content="${esc(f.name)}">
<meta property="og:locale" content="en_CA">
${image ? `<meta property="og:image" content="${image}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
${icon ? `<link rel="icon" href="${icon}">\n<link rel="apple-touch-icon" href="${icon}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${LOOK_FONTS[look]}">
<style>${css(theme)}${lookCss(look)}</style>
${meta.jsonLd.map((ld) => `<script type="application/ld+json">${jsonForScript(ld)}</script>`).join("\n")}`;
}

export function renderSitePage(content: SiteContent, opts: SiteRenderOptions): string {
  const f = content.facts;
  const copy = effectiveCopy(content);
  const theme = siteTheme(f, content.settings.color);
  const look = resolveSiteTheme(content.settings.theme, f.tradeId);
  const isPricePage = content.mode === "price_page";
  const tel = telHref(f.phoneE164);
  const hasForm = Boolean(opts.formKey);
  const embedForm = Boolean(safeHref(opts.embedFormOrigin)) && !opts.preview;
  const booking = safeHref(opts.bookingUrl);
  const website = safeHref(f.website);
  const logo = safeHref(f.logoUrl);
  // The owner's first photo, else the stock photo (top of the page only; never in "Our work").
  const top = heroPhoto(content);
  const photo = top ? safeHref(top.url) : null;
  const showPrices = content.settings.showPrices;
  const anyPrice = showPrices && f.services.some((s) => s.priceText);
  const servicePaths = new Map(sitePages(content).flatMap((p) => (p.kind === "service" ? [[p.service.key, p.path] as const] : [])));

  const topLinks = [
    website && isPricePage ? `<a href="${website}" rel="noopener">Visit our main site</a>` : "",
    tel ? `<a class="top-phone" href="${esc(tel)}">${ICON.phone}<span class="phone-num">${esc(f.phoneDisplay)}</span></a>` : "",
  ].join("");

  const ctas = [
    tel ? `<a class="btn btn-accent btn-big" href="${esc(tel)}">${ICON.phone}<span>Call <span class="phone-num">${esc(f.phoneDisplay)}</span></span></a>` : "",
    hasForm ? `<a class="btn ${tel ? "btn-ghost" : "btn-accent"} btn-big" href="#quote">Get a quote</a>` : "",
    booking ? `<a class="btn btn-ghost btn-big" href="${booking}">${ICON.calendar}<span>Book online</span></a>` : "",
  ].join("");

  const doorItems = [
    f.serviceArea ? `<li>${ICON.pin}<span>${esc(f.serviceArea)}</span></li>` : "",
    f.hoursLines.length ? `<li>${ICON.clock}<span>${f.hoursLines.map(esc).join("<br>")}</span></li>` : "",
  ].join("");
  const heroAside = photo
    ? `<div class="hero-photo"><img src="${photo}" alt="" loading="eager" decoding="async"></div>`
    : tel || doorItems
      ? `<aside class="door" aria-label="Contact">
      ${tel ? `<h2>Call or text</h2><a class="big-phone" href="${esc(tel)}">${esc(f.phoneDisplay)}</a>` : `<h2>${esc(f.name)}</h2>`}
      ${doorItems ? `<ul>${doorItems}</ul>` : ""}
    </aside>`
      : "";

  const heroText = `<div class="hero-text">
      ${look === "classic" && f.serviceArea ? `<p class="kicker">${esc(f.serviceArea)}</p>` : ""}
      <h1${look === "bold" && copy.headline.length <= BOLD_CAPS_MAX ? ' class="caps"' : ""}>${esc(copy.headline)}</h1>
      <p class="sub">${esc(copy.subhead)}</p>
      ${ctas ? `<div class="ctas">${ctas}</div>` : ""}
      ${ratingBadge(f, "rating")}
    </div>`;
  // Bold: the colour band (light with a rail for trades that read better plain). Clean: a light
  // hero with a rounded photo or contact card. Classic: the first photo full-bleed behind the text.
  const hero =
    look === "classic"
      ? `<header class="hero classic${photo ? " has-photo" : ""}">
  ${photo ? `<img class="hero-bg" src="${photo}" alt="" loading="eager" decoding="async">` : ""}
  <div class="wrap hero-grid">
    ${heroText}
    ${photo ? "" : heroAside}
  </div>
</header>`
      : `<header class="hero ${look === "clean" ? "clean" : theme.variant}">
  <div class="wrap hero-grid">
    ${heroText}
    ${heroAside}
  </div>
</header>`;

  const services = f.services.length
    ? `<section class="section flow" id="services" aria-labelledby="services-title">
  <div class="wrap">
    <div class="section-head"><h2 id="services-title">${anyPrice ? "Services and prices" : "Services"}</h2>${anyPrice && hasForm ? `<p>Don't see your job? <a href="#quote">Ask for a quote</a>.</p>` : ""}</div>
    <ul class="sheet">${f.services.map((s) => serviceRow(s, copy.serviceBlurbs[s.key], showPrices, hasForm, servicePaths.has(s.key) ? pageHref(opts, servicePaths.get(s.key)!) : null)).join("")}</ul>
  </div>
</section>`
    : "";

  const steps = stepsSection(content, opts);

  // The first photo is the big one at the top; the rest are a small gallery.
  const more = f.photos.slice(1, 6).map((p) => safeHref(p)).filter((p): p is string => Boolean(p));
  const gallery = more.length
    ? `<section class="section flow" id="photos" aria-labelledby="photos-title">
  <div class="wrap">
    <div class="section-head"><h2 id="photos-title">Our work</h2></div>
    <ul class="gallery">${more.map((src) => `<li><img src="${src}" alt="" loading="lazy" decoding="async"></li>`).join("")}</ul>
  </div>
</section>`
    : "";

  const facts = [areaBlock(f), hoursBlock(f)].filter(Boolean).join("");
  const about = !isPricePage || facts
    ? `<section class="section flow" id="about" aria-labelledby="about-title"${f.services.length ? '' : ""}>
  <div class="wrap about${isPricePage ? " about-facts" : ""}">
    ${!isPricePage ? `<div class="about-copy"><h2 id="about-title">About ${esc(f.name)}</h2><p>${esc(copy.about)}</p>${f.highlights.length ? `<ul class="highlights">${f.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}</div>` : `<h2 id="about-title" class="about-copy">Where and when we work</h2>`}
    ${facts ? `<div class="facts">${facts}</div>` : ""}
  </div>
</section>`
    : "";

  const reviews = reviewsSection(f, opts);

  const faqs = copy.faqs.length
    ? `<section class="section flow" aria-labelledby="faq-title"${reviews ? "" : ''}>
  <div class="wrap faq">
    <div class="section-head"><h2 id="faq-title">Questions</h2></div>
    ${copy.faqs.map((q) => `<details><summary>${esc(q.question)}</summary><p>${esc(q.answer)}</p></details>`).join("")}
  </div>
</section>`
    : "";

  // Hero first and the quote form last (every "Get a quote" button points at it); the sections
  // between follow the owner's order, minus the ones they hid. A price page has no steps.
  const byId: Record<SiteSectionId, string> = { services, steps: isPricePage ? "" : steps, photos: gallery, about, reviews, faqs };
  const middle = content.settings.sections.filter((sec) => !sec.hidden).map((sec) => byId[sec.id]);
  return documentHtml(content, opts, theme, look, homeMeta(content, opts), [hero, ...middle, quoteForm(content, opts)], { topLinks, home: true });
}

/**
 * Site stats: one "view" per page per browsing session, and every tap on a call link. The
 * landing referrer and campaign tags are kept for the session so a visitor who arrived from
 * Google still counts as Google on the second page. Nothing else about the visitor is sent.
 */
function statsScript(opts: SiteRenderOptions, path: string): string {
  const stats = opts.stats;
  const endpoint = stats ? safeHref(stats.endpoint) : null;
  if (!stats || !endpoint || opts.preview) return "";
  const cfg = jsonForScript({ u: stats.endpoint, s: stats.slug, p: path });
  return `<script>(function(c){var ss;try{ss=window.sessionStorage}catch(e){}function g(k){try{return ss?ss.getItem(k):null}catch(e){return null}}function st(k,v){try{ss&&ss.setItem(k,v)}catch(e){}}
var q=new URLSearchParams(location.search),r=g("evd-ref");if(r===null){r=document.referrer||"";st("evd-ref",r);st("evd-us",q.get("utm_source")||"");st("evd-um",q.get("utm_medium")||"");st("evd-ad",q.has("gclid")||q.has("fbclid")?"1":"")}
function send(k){var b=JSON.stringify({s:c.s,p:c.p,k:k,r:r.slice(0,500),us:(g("evd-us")||"").slice(0,100)||null,um:(g("evd-um")||"").slice(0,100)||null,ad:g("evd-ad")==="1"});
try{if(navigator.sendBeacon&&navigator.sendBeacon(c.u,new Blob([b],{type:"text/plain"})))return}catch(e){}try{fetch(c.u,{method:"POST",body:b,keepalive:true,mode:"no-cors",headers:{"Content-Type":"text/plain"}})}catch(e){}}
var vk="evd-v:"+c.s+":"+c.p;if(!g(vk)){st(vk,"1");send("view")}
document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest('a[href^="tel:"]'):null;if(a)send("call")},true)})(${cfg});</script>`;
}

/** Where a link to one of the site's pages goes (null = the home page). */
function pageHref(opts: SiteRenderOptions, path: string | null): string {
  return opts.pageHref ? opts.pageHref(path) : sitePageUrl(opts.url, path);
}

/** The town pages, for "Areas we serve" links (the footer and the service pages). */
function areaLinks(content: SiteContent, opts: SiteRenderOptions, except: string | null = null): string {
  const areas = sitePages(content).filter((p): p is SiteAreaPage => p.kind === "area" && p.path !== except);
  return areas.map((p) => `<li><a href="${esc(pageHref(opts, p.path))}">${esc(p.label)}</a></li>`).join("");
}

/**
 * The whole document around a page's sections: head, top bar, footer (with the town pages),
 * the phone call bar and the form script. Shared by the home page and the extra pages.
 */
function documentHtml(
  content: SiteContent,
  opts: SiteRenderOptions,
  theme: SiteTheme,
  look: SiteThemeId,
  meta: PageMeta,
  parts: string[],
  extra: { topLinks?: string; home: boolean; path?: string },
): string {
  const f = content.facts;
  const isPricePage = content.mode === "price_page";
  const tel = telHref(f.phoneE164);
  const hasForm = Boolean(opts.formKey);
  const embedForm = Boolean(safeHref(opts.embedFormOrigin)) && !opts.preview;
  const booking = safeHref(opts.bookingUrl);
  const website = safeHref(f.website);
  const logo = safeHref(f.logoUrl);
  const quoteHref = hasForm || tel ? "#quote" : null;
  const credit = opts.creditUrl ? safeHref(opts.creditUrl) : null;
  const areas = areaLinks(content, opts);
  // Unsplash asks for credit to the photographer and Unsplash, with referral links, wherever it shows.
  const stock = extra.home ? heroPhoto(content)?.stock ?? null : null;
  const stockCredit = stock
    ? `Top photo by <a href="${safeHref(stock.photographerUrl) ?? "https://unsplash.com/"}" rel="noopener nofollow" target="_blank">${esc(stock.photographer)}</a> on <a href="${safeHref(stock.pageUrl) ?? "https://unsplash.com/"}" rel="noopener nofollow" target="_blank">Unsplash</a>`
    : "";
  const footer = `<footer class="foot">
  <div class="wrap">
    <div>
      <p class="foot-name">${esc(f.name)}</p>
      ${tel ? `<p><a href="${esc(tel)}" class="phone-num">${esc(f.phoneDisplay)}</a></p>` : ""}
      ${f.serviceArea ? `<p>${esc(f.serviceArea)}</p>` : ""}
      ${website ? `<p><a href="${website}" rel="noopener">${isPricePage ? "Visit our main site" : "Our website"}</a></p>` : ""}
    </div>
    ${areas ? `<nav class="foot-areas" aria-label="Areas we serve"><p class="foot-name">Areas we serve</p><ul>${areas}</ul></nav>` : ""}
    ${stockCredit ? `<p class="credit photo-credit">${stockCredit}</p>` : ""}
    ${credit ? `<p class="credit"><a href="${credit}" rel="noopener">Powered by Everdoer</a></p>` : ""}
  </div>
</footer>`;

  const bar = tel || quoteHref
    ? `<nav class="bar" aria-label="Quick actions">${tel ? `<a class="btn btn-call" href="${esc(tel)}">${ICON.phone}<span>Call</span></a>` : ""}${quoteHref && hasForm ? `<a class="btn btn-accent" href="#quote">Get a quote</a>` : ""}${!hasForm && booking ? `<a class="btn btn-accent" href="${booking}">Book online</a>` : ""}</nav>`
    : "";

  const homeLink = extra.home ? "#main" : esc(pageHref(opts, null));
  return `<!doctype html>
<html lang="en-CA">
<head>
${head(content, opts, theme, look, meta)}
</head>
<body class="look-${look}">
<a class="skip" href="#main">Skip to content</a>
${opts.preview ? '<div class="preview">Preview. Only you can see this until the page is published.</div>' : ""}
<div class="top"><div class="wrap">
  <a class="brand" href="${homeLink}" aria-label="${esc(f.name)}${extra.home ? "" : " home page"}">${logo ? `<img src="${logo}" alt="${esc(f.name)} logo">` : `<span class="wordmark">${esc(f.name)}</span>`}</a>
  ${extra.topLinks ? `<div class="top-links">${extra.topLinks}</div>` : ""}
</div></div>
<main id="main">
${parts.filter(Boolean).join("\n")}
</main>
${footer}
${bar}
${hasForm && !embedForm && opts.turnstileSiteKey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ""}
${hasForm && !embedForm ? `<script>${FORM_JS}</script>` : ""}
${statsScript(opts, extra.path ?? "")}
</body>
</html>`;
}

// ── Service and town pages ───────────────────────────────────────────────────

function breadcrumbLd(opts: SiteRenderOptions, name: string, page: SitePage): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name, item: opts.url },
      { "@type": "ListItem", position: 2, name: page.label, item: sitePageUrl(opts.url, page.path) },
    ],
  };
}

function towns(content: SiteContent): string[] {
  return content.mode === "full" ? siteTowns(content) : [];
}

function subpageMeta(content: SiteContent, opts: SiteRenderOptions, page: SitePage): PageMeta {
  const f = content.facts;
  const copy = effectiveCopy(content);
  const url = sitePageUrl(opts.url, page.path);
  const reach = f.phoneDisplay ? `Call ${f.phoneDisplay} or ask for a quote online.` : "Ask for a quote online.";
  if (page.kind === "service") {
    const s = page.service;
    const where = f.serviceArea ? ` in ${f.serviceArea}` : "";
    const price = content.settings.showPrices && s.priceText ? ` ${s.priceText}.` : "";
    const line = copy.serviceBlurbs[s.key] || s.description || "";
    const provider: Record<string, unknown> = { "@type": tradeProfile(f.tradeId).schemaType, name: f.name, url: opts.url };
    if (f.phoneE164) provider.telephone = f.phoneE164;
    const service: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Service",
      name: s.label,
      serviceType: s.label,
      url,
      provider,
    };
    if (line) service.description = line;
    const t = towns(content);
    if (t.length) service.areaServed = t.map((name) => ({ "@type": "City", name }));
    else if (f.serviceArea) service.areaServed = f.serviceArea;
    return {
      title: `${s.label}${where} | ${f.name}`.slice(0, 120),
      description: `${line ? `${line.replace(/[.\s]+$/, "")}. ` : ""}${s.label} from ${f.name}${where}.${price} ${reach}`.replace(/\s+/g, " ").trim().slice(0, 300),
      url,
      jsonLd: [service, breadcrumbLd(opts, f.name, page)],
    };
  }
  const services = f.services.slice(0, 4).map((s) => s.label.toLowerCase());
  const business = { ...buildJsonLd(content, opts), areaServed: { "@type": "City", name: page.town } };
  return {
    title: `${page.label} | ${f.name}`.slice(0, 120),
    description: `${f.name} works in ${page.town}${services.length ? `: ${services.join(", ")}` : ""}. ${reach}`.slice(0, 300),
    url,
    jsonLd: [business, breadcrumbLd(opts, f.name, page)],
  };
}

function linkList(id: string, title: string, items: Array<{ href: string; label: string }>): string {
  if (!items.length) return "";
  return `<section class="section flow" aria-labelledby="${id}">
  <div class="wrap">
    <div class="section-head"><h2 id="${id}">${esc(title)}</h2></div>
    <ul class="links">${items.map((i) => `<li><a href="${esc(i.href)}">${esc(i.label)}</a></li>`).join("")}</ul>
  </div>
</section>`;
}

/**
 * One of the site's extra pages: a service ("Roof snow removal in Barrie") or a town ("Snow
 * removal in Innisfil"). Same look, top bar, footer, call bar and quote form as the home page,
 * built only from the same facts. No questions section (it would repeat the home page word for
 * word); the owner's hidden sections stay hidden here too.
 */
export function renderSiteSubpage(content: SiteContent, opts: SiteRenderOptions, page: SitePage): string {
  const f = content.facts;
  const copy = effectiveCopy(content);
  const theme = siteTheme(f, content.settings.color);
  const look = resolveSiteTheme(content.settings.theme, f.tradeId);
  const tel = telHref(f.phoneE164);
  const hasForm = Boolean(opts.formKey);
  const booking = safeHref(opts.bookingUrl);
  const showPrices = content.settings.showPrices;
  const hidden = new Set(content.settings.sections.filter((sec) => sec.hidden).map((sec) => sec.id));
  const all = sitePages(content);
  const servicePaths = new Map(all.flatMap((p) => (p.kind === "service" ? [[p.service.key, p.path] as const] : [])));
  const home = pageHref(opts, null);

  const isService = page.kind === "service";
  const service = isService ? (page as SiteServicePage).service : null;
  const area = isService ? f.serviceArea : (page as SiteAreaPage).town;
  const others = towns(content).filter((t) => t !== area);
  const h1 = isService ? `${service!.label}${area ? ` in ${area}` : ""}` : page.label;
  const sub = isService
    ? copy.serviceBlurbs[service!.key] || `${f.name} does ${service!.label.toLowerCase()}${area ? ` in ${area}` : ""}.`
    : `${f.name} works in ${area}${others.length ? ` and nearby in ${others.slice(0, 3).join(", ")}` : ""}.`;

  const ctas = [
    tel ? `<a class="btn btn-accent btn-big" href="${esc(tel)}">${ICON.phone}<span>Call <span class="phone-num">${esc(f.phoneDisplay)}</span></span></a>` : "",
    hasForm ? `<a class="btn ${tel ? "btn-ghost" : "btn-accent"} btn-big" href="#quote">Get a quote</a>` : "",
    booking ? `<a class="btn btn-ghost btn-big" href="${booking}">${ICON.calendar}<span>Book online</span></a>` : "",
  ].join("");
  const doorItems = [
    f.serviceArea ? `<li>${ICON.pin}<span>${esc(f.serviceArea)}</span></li>` : "",
    f.hoursLines.length ? `<li>${ICON.clock}<span>${f.hoursLines.map(esc).join("<br>")}</span></li>` : "",
  ].join("");
  const door = tel || doorItems
    ? `<aside class="door" aria-label="Contact">
      ${tel ? `<h2>Call or text</h2><a class="big-phone" href="${esc(tel)}">${esc(f.phoneDisplay)}</a>` : `<h2>${esc(f.name)}</h2>`}
      ${doorItems ? `<ul>${doorItems}</ul>` : ""}
    </aside>`
    : "";
  const heroClass = look === "classic" ? "classic" : look === "clean" ? "clean" : theme.variant;
  const hero = `<header class="hero ${heroClass}">
  <div class="wrap hero-grid">
    <div class="hero-text">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="${esc(home)}">${esc(f.name)}</a><span aria-hidden="true"> / </span><span aria-current="page">${esc(page.label)}</span></nav>
      <h1${look === "bold" && h1.length <= BOLD_CAPS_MAX ? ' class="caps"' : ""}>${esc(h1)}</h1>
      <p class="sub">${esc(sub)}</p>
      ${ctas ? `<div class="ctas">${ctas}</div>` : ""}
      ${ratingBadge(f, "rating")}
    </div>
    ${door}
  </div>
</header>`;

  const facts = [areaBlock(f), hoursBlock(f)].filter(Boolean).join("");
  let main: string;
  if (isService) {
    const s = service!;
    const blurb = copy.serviceBlurbs[s.key];
    const long = s.description && s.description !== blurb ? s.description : null;
    main = `<section class="section flow" id="services" aria-labelledby="services-title">
  <div class="wrap">
    <div class="section-head"><h2 id="services-title">${showPrices && s.priceText ? "Price" : "Get a price"}</h2></div>
    <ul class="sheet">${serviceRow(s, long ?? undefined, showPrices, hasForm)}</ul>
    ${facts ? `<div class="about about-facts" style="margin-top:28px"><div class="facts">${facts}</div></div>` : ""}
  </div>
</section>`;
  } else {
    main = `<section class="section flow" id="services" aria-labelledby="services-title">
  <div class="wrap">
    <div class="section-head"><h2 id="services-title">${showPrices && f.services.some((s) => s.priceText) ? `Services and prices in ${esc(area)}` : `Services in ${esc(area)}`}</h2></div>
    <ul class="sheet">${f.services.map((s) => serviceRow(s, copy.serviceBlurbs[s.key], showPrices, hasForm, servicePaths.has(s.key) ? pageHref(opts, servicePaths.get(s.key)!) : null)).join("")}</ul>
  </div>
</section>
${hidden.has("about") ? "" : `<section class="section flow" id="about" aria-labelledby="about-title">
  <div class="wrap about">
    <div class="about-copy"><h2 id="about-title">About ${esc(f.name)}</h2><p>${esc(copy.about)}</p></div>
    ${facts ? `<div class="facts">${facts}</div>` : ""}
  </div>
</section>`}`;
  }

  const moreServices = isService
    ? linkList(
        "more-title",
        "Other services",
        all.filter((p): p is SiteServicePage => p.kind === "service" && p.path !== page.path).map((p) => ({ href: pageHref(opts, p.path), label: p.label })),
      )
    : "";
  const parts = [
    hero,
    main,
    hidden.has("steps") ? "" : stepsSection(content, opts),
    hidden.has("reviews") ? "" : reviewsSection(f, opts),
    moreServices,
    quoteForm(content, opts, service?.label ?? null),
  ];
  return documentHtml(content, opts, theme, look, subpageMeta(content, opts, page), parts, { home: false, path: page.path });
}

/** Neutral not-found page (unknown, draft and unpublished slugs all look the same). */
export function renderSiteNotFound(): string {
  return `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found</title>
<style>body{margin:0;font:400 17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f2f4f6;color:#15202a;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}main{max-width:26rem}h1{font-size:1.4rem;margin:0 0 8px}p{margin:0;color:#46525e}</style></head>
<body><main><h1>This page isn't available</h1><p>The address may be mistyped, or the page has been taken down.</p></main></body></html>`;
}
