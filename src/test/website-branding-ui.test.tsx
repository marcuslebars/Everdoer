/** Settings → Your website: the logo/photos/tab icon card and the own-domain card. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteView } from "@/lib/site-api";

const upload = vi.fn();
const change = vi.fn();
const connect = vi.fn();
const check = vi.fn();
const remove = vi.fn();
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/site-api", () => ({
  useSiteImages: () => ({ upload: { mutateAsync: upload, isPending: false }, change: { mutateAsync: change, isPending: false } }),
  useSiteDomain: () => ({
    connect: { mutateAsync: connect, isPending: false },
    check: { mutateAsync: check, isPending: false },
    remove: { mutateAsync: remove, isPending: false },
  }),
}));

import { SiteDomainCard, SiteImagesCard } from "@/components/settings/WebsiteBranding";

function view(over: Partial<SiteView> = {}, site: Partial<NonNullable<SiteView["site"]>> = {}): SiteView {
  return {
    companyId: "co-1",
    companyName: "A1 Coatings",
    hasWebsite: false,
    canManage: true,
    logoUrl: null,
    photos: [],
    maxPhotos: 6,
    domainsEnabled: true,
    site: {
      slug: "a1-coatings",
      status: "published",
      mode: "full",
      url: "https://app.everdoer.com/s/a1-coatings",
      ourUrl: "https://app.everdoer.com/s/a1-coatings",
      previewUrl: "/preview",
      generatedAt: null,
      publishedAt: null,
      copySource: "template",
      headline: "",
      subhead: "",
      about: "",
      generated: null,
      edited: { headline: false, subhead: false, about: false },
      showPrices: true,
      servicesCount: 0,
      pricedCount: 0,
      factsUsed: [],
      faviconUrl: null,
      domain: null,
      ...site,
    },
    ...over,
  };
}

beforeEach(() => {
  [upload, change, connect, check, remove].forEach((f) => f.mockReset().mockResolvedValue(undefined));
});

describe("logo and photos", () => {
  it("picking a file uploads it as the right kind", () => {
    render(<SiteImagesCard orgId="org-1" view={view()} />);
    const file = new File(["x"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("logo-input"), { target: { files: [file] } });
    expect(upload).toHaveBeenCalledWith({ kind: "logo", file });
    fireEvent.change(screen.getByTestId("favicon-input"), { target: { files: [file] } });
    expect(upload).toHaveBeenLastCalledWith({ kind: "favicon", file });
  });

  it("photos: first is the cover; others can be made the cover or removed; add hidden at the limit", () => {
    const photos = ["https://cdn/1.jpg", "https://cdn/2.jpg"];
    const { rerender } = render(<SiteImagesCard orgId="org-1" view={view({ photos })} />);
    expect(screen.getByText("Cover")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make photo 2 the cover" }));
    expect(change).toHaveBeenCalledWith({ action: "cover", kind: "photo", url: "https://cdn/2.jpg" });
    fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
    expect(change).toHaveBeenLastCalledWith({ action: "remove", kind: "photo", url: "https://cdn/1.jpg" });
    rerender(<SiteImagesCard orgId="org-1" view={view({ photos: Array.from({ length: 6 }, (_, i) => `https://cdn/${i}.jpg`) })} />);
    expect(screen.queryByRole("button", { name: /Add a photo/ })).toBeNull();
  });

  it("members see the images but no buttons; no page yet → no tab icon section", () => {
    render(<SiteImagesCard orgId="org-1" view={view({ canManage: false, site: null, logoUrl: "https://cdn/logo.png" })} />);
    expect(screen.getByAltText("Your logo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /logo/i })).toBeNull();
    expect(screen.queryByText("Browser tab icon")).toBeNull();
  });
});

describe("your own domain", () => {
  it("connect sends what was typed", () => {
    render(<SiteDomainCard orgId="org-1" view={view()} />);
    fireEvent.change(screen.getByLabelText("Your domain"), { target: { value: "www.a1coatings.ca" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(connect).toHaveBeenCalledWith("www.a1coatings.ca");
  });

  it("not set up on the server → says so, no form", () => {
    render(<SiteDomainCard orgId="org-1" view={view({ domainsEnabled: false })} />);
    expect(screen.getByText(/isn't switched on yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Your domain")).toBeNull();
  });

  it("pending: the DNS records to add, with their state, and Check now", () => {
    render(
      <SiteDomainCard
        orgId="org-1"
        view={view({}, {
          domain: {
            name: "www.a1coatings.ca",
            status: "pending",
            checkedAt: null,
            dns: {
              certificate: null,
              records: [
                { type: "CNAME", name: "www", value: "x1.up.railway.app", status: "VALID" },
                { type: "TXT", name: "_railway-verify.www", value: "railway-verify=tok", status: null },
              ],
            },
          },
        })}
      />,
    );
    const table = within(screen.getByTestId("domain-dns"));
    expect(table.getByText("x1.up.railway.app")).toBeInTheDocument();
    expect(table.getByText("Found")).toBeInTheDocument();
    expect(table.getByText("railway-verify=tok")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Check now/ }));
    expect(check).toHaveBeenCalled();
  });

  it("live: the link, and disconnect", () => {
    render(<SiteDomainCard orgId="org-1" view={view({}, { domain: { name: "www.a1coatings.ca", status: "active", checkedAt: null, dns: { records: [], certificate: "ISSUED" } } })} />);
    expect(screen.getByRole("link", { name: "www.a1coatings.ca" })).toHaveAttribute("href", "https://www.a1coatings.ca");
    fireEvent.click(screen.getByRole("button", { name: /Disconnect/ }));
    expect(remove).toHaveBeenCalled();
  });
});
