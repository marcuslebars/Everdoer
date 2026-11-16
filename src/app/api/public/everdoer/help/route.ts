import { NextResponse } from "next/server";

import { HELP_ARTICLES, brandHelpArticle } from "@/content/help/articles";
import { PLATFORM_BRANDS } from "@/lib/platform-brand";

export const dynamic = "force-static";

/**
 * Public help library for everdoer.com/help (the marketing site pulls it at build time).
 * The same articles as the in-app Help panel, with {{product}} filled in as the done-for-you
 * brand — the plans everdoer.com sells. Read-only, no secrets: it's the same text any signed-in
 * user sees, so it's public and cacheable. Shape: { articles: HelpArticle[] } minus keywords.
 */
export function GET(): NextResponse {
  const brand = PLATFORM_BRANDS.crankleads;
  const articles = HELP_ARTICLES.map((article) => {
    const { keywords: _keywords, ...branded } = brandHelpArticle(article, brand);
    return branded;
  });
  return NextResponse.json(
    { articles },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600", "Access-Control-Allow-Origin": "*" } },
  );
}
