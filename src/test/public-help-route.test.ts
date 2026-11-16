/** everdoer.com/help pulls the in-app help library from this public endpoint at build time. */
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/public/everdoer/help/route";
import { HELP_ARTICLES } from "@/content/help/articles";

describe("GET /api/public/everdoer/help", () => {
  it("returns every article, branded Everdoer, without search keywords, cacheable and open to any origin", async () => {
    const res = GET();
    expect(res.headers.get("cache-control")).toContain("public");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as { articles: Array<Record<string, unknown>> };
    expect(body.articles.map((a) => a.id)).toEqual(HELP_ARTICLES.map((a) => a.id));
    const text = JSON.stringify(body);
    expect(text).not.toContain("{{product}}");
    expect(text).toContain("Everdoer");
    expect(body.articles.every((a) => !("keywords" in a))).toBe(true);
  });
});
