-- Post-P13: public view counts for articles (/articles/[slug]).
-- The site's ONLY table written by visitor activity: web/app/api/views/[slug]/route.ts
-- increments a row once per browser per 24 h (web/components/article/ViewPing.tsx).
-- The route accepts only slugs in web/content/articles/index.ts and counts only on
-- the production deployment (VERCEL_ENV = 'production'), so dev / preview never
-- inflate it. Nothing about the reader is stored -- no IP, no user agent, no id.
-- Grain: ONE ROW PER ARTICLE SLUG; a slug with no row has 0 views.
-- RLS on with no policies: this shared project exposes `public` through Supabase's
-- REST API, and nothing should reach this table that way. The site connects as
-- `postgres` (owner, BYPASSRLS), so its own reads and writes are unaffected.
-- Apply via:  python etl/apply_migration.py db/migrations/026_article_views.sql

create table if not exists web_article_views (
  slug        text        primary key,  -- content/articles/index.ts slug
  views       bigint      not null default 0,
  updated_at  timestamptz not null default now()
);

alter table web_article_views enable row level security;
