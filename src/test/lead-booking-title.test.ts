/** Jobs (and invoices) made from a booking form get a readable title, never the source slug. */
import { describe, expect, it } from "vitest";

import { leadBookingTitle } from "@/server/services/lead-intake/intake";

describe("leadBookingTitle", () => {
  it("service and customer", () => {
    expect(leadBookingTitle({ services: ["Shrink wrap"], contact: { name: "Cam", phone: "+17055550100" } })).toBe("Shrink wrap — Cam");
  });

  it("falls back to line items, then the asset type, then the customer", () => {
    expect(
      leadBookingTitle({ lineItems: [{ description: "Mobile shrink wrap (18 ft)", quantity: 1, unitPriceCents: 1 }], contact: { phone: "1" } }),
    ).toBe("Mobile shrink wrap (18 ft)");
    expect(leadBookingTitle({ asset: { type: "Bowrider" }, contact: { name: "Sam", email: "s@x.co" } })).toBe("Bowrider — Sam");
    expect(leadBookingTitle({ contact: { name: "Sam", email: "s@x.co" } })).toBe("Booking — Sam");
    expect(leadBookingTitle({ contact: { email: "s@x.co" } })).toBe("Online booking");
  });

  it("long lists are shortened", () => {
    expect(leadBookingTitle({ services: ["Wash", "Wax", "Interior", "Gelcoat"], contact: { name: "Jo", phone: "1" } })).toBe(
      "Wash, Wax + 2 more — Jo",
    );
  });

  it("never contains the source slug", () => {
    const title = leadBookingTitle({ contact: { name: "Cam", phone: "1" } });
    expect(title).not.toMatch(/a1marinecare-booking|Lead booking/);
  });
});
