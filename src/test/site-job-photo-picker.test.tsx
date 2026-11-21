/** "Add to my website" from a finished job, and the Settings picker. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: null as unknown,
  add: vi.fn(async () => ({})),
}));
vi.mock("@/lib/site-api", () => ({
  useSiteJobPhotos: () => ({ data: state.data, isLoading: false }),
  useAddJobPhotoToSite: () => ({ mutateAsync: state.add }),
}));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { JobPhotosToWebsite, SiteJobPhotoPicker } from "@/components/website/SiteJobPhotoPicker";

const photo = (id: string, onSite = false) => ({ id, url: `https://signed/${id}.jpg`, takenAt: "2026-11-21T10:00:00Z", jobTitle: "Smith driveway", onSite });

describe("job sheet", () => {
  it("offers each photo; added ones say so; nothing without a page", async () => {
    state.data = { hasSite: true, room: 5, photos: [photo("a"), photo("b", true)] };
    const { unmount } = render(<JobPhotosToWebsite orgId="o" companyId="c" bookingId="b1" />);
    expect(screen.getByText("Show this job off on your website?")).toBeInTheDocument();
    expect(screen.getByText("On your website")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add photo from Smith driveway to your website" }));
    await waitFor(() => expect(state.add).toHaveBeenCalledWith("a"));
    unmount();

    state.data = { hasSite: false, room: 6, photos: [photo("a")] };
    const { container } = render(<JobPhotosToWebsite orgId="o" companyId="c" bookingId="b1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a full page can't take more", () => {
    state.data = { hasSite: true, room: 0, photos: [photo("a")] };
    render(<JobPhotosToWebsite orgId="o" companyId="c" bookingId="b1" />);
    expect(screen.getByRole("button", { name: /Add photo/ })).toBeDisabled();
    expect(screen.getByText(/already has 6 photos/)).toBeInTheDocument();
  });
});

describe("settings picker", () => {
  it("opens to the latest job photos", () => {
    state.data = { hasSite: true, room: 6, photos: [photo("a"), photo("b")] };
    render(<SiteJobPhotoPicker orgId="o" companyId="c" />);
    expect(screen.queryByRole("button", { name: /Add photo/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose photos" }));
    expect(screen.getAllByRole("button", { name: /Add photo from Smith driveway/ })).toHaveLength(2);
  });
});
