/** Retell's v2 list endpoints (the legacy GET /list-* endpoints now answer 400) and the inbound_agents binding. */
import { describe, expect, it, vi } from "vitest";

import { boundInboundAgents } from "@/server/services/rebrand/retell-repoint";
import { listAllPages, phoneNumberListPath, RETELL_LIST_PAGE_SIZE } from "@/server/services/retell/provision";

describe("Retell v2 list pagination", () => {
  it("follows pagination_key while has_more, and reads items (not a top-level array)", async () => {
    const pages: Record<string, { items: string[]; has_more: boolean; pagination_key?: string }> = {
      first: { items: ["a", "b"], has_more: true, pagination_key: "k1" },
      k1: { items: ["c"], has_more: true, pagination_key: "k2" },
      k2: { items: ["d"], has_more: false },
    };
    const fetchPage = vi.fn(async (key: string | null) => pages[key ?? "first"]);
    expect(await listAllPages(fetchPage)).toEqual(["a", "b", "c", "d"]);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([null, "k1", "k2"]);
  });

  it("stops on a repeated key, a missing key, or a page without items", async () => {
    const loop = vi.fn(async () => ({ items: ["x"], has_more: true, pagination_key: "same" }));
    expect(await listAllPages(loop)).toEqual(["x", "x"]);
    expect(loop).toHaveBeenCalledTimes(2);
    expect(await listAllPages(async () => ({ has_more: true }))).toEqual([]);
  });

  it("builds the v2 phone-number path with limit and the key", () => {
    expect(phoneNumberListPath(null)).toBe(`/v2/list-phone-numbers?limit=${RETELL_LIST_PAGE_SIZE}`);
    expect(phoneNumberListPath("a b/c")).toBe(`/v2/list-phone-numbers?limit=${RETELL_LIST_PAGE_SIZE}&pagination_key=a+b%2Fc`);
  });
});

describe("Retell number → agent binding", () => {
  it("reads inbound_agents, and the legacy inbound_agent_id if a number still has it", () => {
    expect(boundInboundAgents({ inbound_agents: [{ agent_id: "ag1", weight: 0.7 }, { agent_id: "ag2", weight: 0.3 }] })).toEqual(["ag1", "ag2"]);
    expect(boundInboundAgents({ inbound_agent_id: "ag-old" })).toEqual(["ag-old"]);
    expect(boundInboundAgents({ inbound_agents: [{ agent_id: "ag1" }], inbound_agent_id: "ag1" })).toEqual(["ag1"]);
    expect(boundInboundAgents({ inbound_agents: null })).toEqual([]);
    expect(boundInboundAgents({ inbound_agents: [{ weight: 1 }, "junk", { agent_id: "  " }] })).toEqual([]);
  });
});
