import { NextResponse, type NextRequest } from "next/server";
import { getArticle } from "@/content/articles";
import { sql } from "@/lib/db";

// Counts one article view (components/article/ViewPing.tsx calls it once per
// browser per 24 h). The site's only write path driven by visitors, kept narrow:
// - only slugs in content/articles/index.ts — nobody can create rows;
// - only on the production deployment — dev and preview builds share the same
//   database and must not inflate the count (they get the current count back);
// - one parameterized upsert; nothing about the reader is stored.
// A script could still inflate a number; nothing can be read or damaged.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getArticle(slug)) {
    return NextResponse.json({ error: "unknown article" }, { status: 404 });
  }

  const rows =
    process.env.VERCEL_ENV === "production"
      ? await sql<{ views: number }[]>`
          insert into web_article_views (slug, views) values (${slug}, 1)
          on conflict (slug) do update
            set views = web_article_views.views + 1, updated_at = now()
          returning views::int as views
        `
      : await sql<{ views: number }[]>`
          select views::int as views from web_article_views where slug = ${slug}
        `;

  return NextResponse.json(
    { views: rows[0]?.views ?? 0, counted: process.env.VERCEL_ENV === "production" },
    { headers: { "cache-control": "no-store" } },
  );
}
