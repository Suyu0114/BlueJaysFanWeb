import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "midfield.mlbstatic.com",
      },
    ],
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
// Articles are MDX files under content/articles/, imported by the article route
// (never routes themselves, so pageExtensions stays default). No remark/rehype
// plugins: under Turbopack they'd have to be passed by name.
const withMDX = createMDX({});

export default withNextIntl(withMDX(nextConfig));
