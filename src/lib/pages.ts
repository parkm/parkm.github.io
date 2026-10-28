import type { LucideIcon } from "lucide-react";
import { Blocks, File, PartyPopper } from "lucide-react";

export const CATEGORY_ORDER = ["Tools", "Entertainment", "Other"] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_HUE: Record<Category, number> = {
  Tools: 250,
  Entertainment: 35,
  Other: 160,
};

export type SitePage = {
  href: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  category: Category;
};

type PageModule = {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  category?: string;
};

// Excludes the home page and site map.
const modules = import.meta.glob<PageModule>(
  [
    "/src/pages/**/*.astro",
    "!/src/pages/**/index.astro",
    "!/src/pages/map.astro",
  ],
  { eager: true },
);

const toCategory = (category?: string): Category =>
  CATEGORY_ORDER.find((c) => c === category) ?? "Other";

const astroPages: SitePage[] = Object.entries(modules).map(
  ([filePath, module]) => {
    const href = filePath.replace("/src/pages", "").replace(/\.astro$/, "");
    const fallbackTitle = (filePath.split("/").pop() ?? "")
      .replace(".astro", "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return {
      href,
      title: module.title || fallbackTitle,
      description: module.description,
      icon: module.icon ?? File,
      category: toCategory(module.category),
    };
  },
);

// Pages served outside Astro (public/ and other repos on this domain).
const externalPages: SitePage[] = [
  {
    href: "/partygif",
    title: "PartyGif",
    description: "Create party gifs client-side",
    icon: PartyPopper,
    category: "Tools",
  },
  {
    href: "/tetris/",
    title: "Tetris",
    description: "Tetris with tuned DAS/ARR handling and cheese mode",
    icon: Blocks,
    category: "Entertainment",
  },
];

export const pages: SitePage[] = [...astroPages, ...externalPages].toSorted(
  (a, b) => a.title.localeCompare(b.title),
);

export const pagesByCategory = CATEGORY_ORDER.map((category) => ({
  category,
  pages: pages.filter((p) => p.category === category),
}));
