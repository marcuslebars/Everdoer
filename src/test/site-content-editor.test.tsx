/** Settings → Your website: the section, service-line, question and step editors, and the note. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SiteQuestionsCard, SiteRebuildNote, SiteSectionsCard, SiteServiceLinesCard, SiteStepsCard, SiteStockPhotoCard } from "@/components/website/SiteContentEditor";
import type { SiteView } from "@/lib/site-api";

type Site = NonNullable<SiteView["site"]>;

function site(patch: Partial<Site> = {}): Site {
  return {
    slug: "northshore",
    status: "published",
    mode: "full",
    url: "https://x/s/northshore",
    ourUrl: "https://x/s/northshore",
    previewUrl: "/preview",
    generatedAt: null,
    publishedAt: null,
    copySource: "ai",
    headline: "",
    subhead: "",
    about: "",
    generated: null,
    edited: { headline: false, subhead: false, about: false },
    showPrices: true,
    copyNote: null,
    sections: [
      { id: "services", label: "Services and prices", hidden: false, available: true },
      { id: "steps", label: "How it works", hidden: false, available: true },
      { id: "photos", label: "Our work (photos)", hidden: false, available: false },
      { id: "about", label: "About, area and hours", hidden: false, available: true },
      { id: "reviews", label: "Google reviews", hidden: false, available: true },
      { id: "faqs", label: "Questions", hidden: false, available: true },
    ],
    services: [
      { key: "plow", label: "Driveway plowing", blurb: "Ours for plowing.", generated: "Ours for plowing.", edited: false },
      { key: "salt", label: "Salting", blurb: "Mine for salting.", generated: "Ours for salting.", edited: true },
    ],
    faqs: [{ question: "What areas?", answer: "Barrie." }],
    generatedFaqs: [{ question: "What areas?", answer: "Barrie." }],
    faqsEdited: false,
    steps: [
      { title: "Tell us", text: "Call." },
      { title: "Price", text: "We price it." },
      { title: "Pick a time", text: "We set it." },
    ],
    generatedSteps: [
      { title: "Tell us", text: "Call." },
      { title: "Price", text: "We price it." },
      { title: "Pick a time", text: "We set it." },
    ],
    stepsEdited: false,
    pages: null,
    stock: null,
    theme: "auto",
    color: null,
    servicesCount: 2,
    pricedCount: 1,
    factsUsed: [],
    faviconUrl: null,
    domain: null,
    ...patch,
  };
}

const saver = () => vi.fn(async () => true);

describe("sections", () => {
  it("hiding and moving save the whole order straight away", () => {
    const save = saver();
    render(<SiteSectionsCard site={site()} save={save} disabled={false} />);
    fireEvent.click(screen.getByRole("switch", { name: "Show Google reviews" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ sections: expect.arrayContaining([{ id: "reviews", hidden: true }]) }), "Section hidden");

    fireEvent.click(screen.getByRole("button", { name: "Move Questions up" }));
    const order = (save.mock.calls.at(-1) as unknown as [{ sections: Array<{ id: string }> }])[0].sections.map((s) => s.id);
    expect(order).toEqual(["services", "steps", "photos", "about", "faqs", "reviews"]);
    expect(screen.getByRole("button", { name: "Move Services and prices up" })).toBeDisabled();
    expect(screen.getByText("Nothing to show yet, so it stays off the page.")).toBeInTheDocument();
  });
});

describe("service lines", () => {
  it("sends only what changed; typing our line back means 'use ours'", async () => {
    const save = saver();
    render(<SiteServiceLinesCard site={site()} save={save} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Service descriptions/ }));
    fireEvent.change(screen.getByLabelText("Driveway plowing"), { target: { value: "Plowed before you leave for work." } });
    fireEvent.click(screen.getByRole("button", { name: "Use ours" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith({ serviceBlurbs: { plow: "Plowed before you leave for work.", salt: null } }, "Service descriptions saved");
  });
});

describe("questions", () => {
  it("add, fill in and save; a blank one is refused; 'Use ours' resets", () => {
    const save = saver();
    render(<SiteQuestionsCard site={site({ faqsEdited: true })} save={save} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Add a question/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Question 2"), { target: { value: " Do you do cottages? " } });
    fireEvent.change(screen.getByLabelText("Answer 2"), { target: { value: "Yes." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenLastCalledWith(
      {
        faqs: [
          { question: "What areas?", answer: "Barrie." },
          { question: "Do you do cottages?", answer: "Yes." },
        ],
      },
      "Questions saved",
    );
    fireEvent.click(screen.getByRole("button", { name: "Use ours" }));
    expect(save).toHaveBeenLastCalledWith({ faqs: null }, "Back to our questions");
  });
});

describe("steps", () => {
  it("edits save as the owner's; at least two steps; none on a price page", () => {
    const save = saver();
    const { unmount } = render(<SiteStepsCard site={site()} save={save} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: /How it works/ }));
    fireEvent.change(screen.getByLabelText("Step 1 title"), { target: { value: "Call Dave" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((save.mock.calls[0] as unknown as [{ steps: Array<{ title: string }> }])[0].steps[0].title).toBe("Call Dave");
    unmount();

    render(<SiteStepsCard site={site({ steps: site().steps.slice(0, 2) })} save={save} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: /How it works/ }));
    for (const b of screen.getAllByRole("button", { name: "Remove step" })) expect(b).toBeDisabled();

    const { container } = render(<SiteStepsCard site={site({ mode: "price_page" })} save={save} disabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("rewrite with a note", () => {
  it("sends the note; an emptied saved note clears it", () => {
    const onRebuild = vi.fn();
    const { unmount } = render(<SiteRebuildNote savedNote={null} disabled={false} pending={false} onRebuild={onRebuild} />);
    expect(screen.getByRole("button", { name: "Rewrite the page" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Rewrite with a note"), { target: { value: "  Make it friendlier " } });
    fireEvent.click(screen.getByRole("button", { name: "Rewrite the page" }));
    expect(onRebuild).toHaveBeenLastCalledWith("Make it friendlier");
    unmount();

    render(<SiteRebuildNote savedNote="Old note" disabled={false} pending={false} onRebuild={onRebuild} />);
    fireEvent.change(screen.getByLabelText("Rewrite with a note"), { target: { value: "" } });
    expect(screen.getByText("This clears your saved note.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rewrite the page" }));
    expect(onRebuild).toHaveBeenLastCalledWith(null);
  });
});

describe("photo at the top", () => {
  const stock = {
    available: true,
    enabled: true,
    photo: { url: "https://images.unsplash.com/photo-1", alt: "Driveway", photographer: "Pat", photographerUrl: "https://unsplash.com/@pat", pageUrl: "https://unsplash.com/photos/1" },
  };

  it("shows the photo and its credit; 'Show another' and the switch work; hidden once they have photos or it isn't set up", () => {
    const save = saver();
    const onAnother = vi.fn();
    const { unmount } = render(<SiteStockPhotoCard site={site({ stock })} hasOwnPhotos={false} save={save} onAnother={onAnother} disabled={false} pending={false} />);
    expect(screen.getByRole("img", { name: "Driveway" })).toHaveAttribute("src", "https://images.unsplash.com/photo-1");
    expect(screen.getByRole("link", { name: "Unsplash" })).toHaveAttribute("href", "https://unsplash.com/photos/1");
    fireEvent.click(screen.getByRole("button", { name: /Show another/ }));
    expect(onAnother).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("switch", { name: "Use a stock photo at the top" }));
    expect(save).toHaveBeenCalledWith({ stockPhoto: false }, "Stock photo off");
    unmount();

    const a = render(<SiteStockPhotoCard site={site({ stock })} hasOwnPhotos save={save} onAnother={onAnother} disabled={false} pending={false} />);
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    const b = render(<SiteStockPhotoCard site={site({ stock: { ...stock, available: false } })} hasOwnPhotos={false} save={save} onAnother={onAnother} disabled={false} pending={false} />);
    expect(b.container).toBeEmptyDOMElement();
  });
});
