import { getTranslations } from "next-intl/server";
import ScorecardFrame from "@/components/ScorecardFrame";
import ArticleShare from "@/components/article/ArticleShare";
import type { Article } from "@/content/articles";
import { SITE } from "@/lib/site";

// The end of an article: share it, and where to talk about it. The site has no
// comments on purpose (no accounts, spam or moderation to run): discussion
// happens on the article's own X / Instagram post when the registry has one
// (`discuss`), otherwise on the profile. A network with neither is left out;
// with nothing to link, the discussion half disappears.

const LINK =
  "text-navy underline decoration-navy/30 underline-offset-4 transition-colors hover:text-brick hover:decoration-brick";

export default async function ArticleEnd({ article, url, title }: { article: Article; url: string; title: string }) {
  const t = await getTranslations("Articles");
  const discuss = [
    { post: article.discuss?.x, profile: SITE.links.x, postLabel: t("discussX"), profileLabel: t("followX") },
    {
      post: article.discuss?.instagram,
      profile: SITE.links.instagram,
      postLabel: t("discussInstagram"),
      profileLabel: t("followInstagram"),
    },
  ].flatMap((d) =>
    d.post ? [{ href: d.post, label: d.postLabel }] : d.profile ? [{ href: d.profile, label: d.profileLabel }] : [],
  );
  const hasPost = Boolean(article.discuss?.x || article.discuss?.instagram);

  return (
    <ScorecardFrame seedKey={`article-end-${article.slug}`} variant="panel" className="mt-12">
      <div className="relative z-10 grid gap-6 p-5 sm:grid-cols-2">
        <section>
          <h2 className="text-base font-semibold text-navy">{t("shareTitle")}</h2>
          <div className="mt-3">
            <ArticleShare url={url} title={title} />
          </div>
        </section>
        {discuss.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-navy">{t("discussTitle")}</h2>
            <p className="mt-1 text-sm text-navy/65">{hasPost ? t("discussBodyPost") : t("discussBodyProfile")}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {discuss.map((d) => (
                <li key={d.href}>
                  <a href={d.href} target="_blank" rel="noopener noreferrer" className={LINK}>
                    {d.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </ScorecardFrame>
  );
}
