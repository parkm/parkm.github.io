import { facts } from "@/content/facts";
import { indexedPaths } from "@/content/indexing";
import llmsTxt from "@/content/llms.txt?raw";
import profileMarkdown from "@/content/profile.md?raw";

export { facts, indexedPaths, llmsTxt, profileMarkdown };

/** Whether a path is listed in src/content/indexing.ts. */
export const isIndexed = (path: string) =>
  indexedPaths.includes(path.replace(/(.)\/$/, "$1"));

export const absoluteUrl = (path: string) =>
  new URL(path, facts.url).toString();

/** schema.org graph for the home page. */
export function homeJsonLd() {
  const person = `${facts.url}/#person`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        url: facts.url,
        mainEntity: { "@id": person },
      },
      {
        "@type": "Person",
        "@id": person,
        name: facts.name,
        url: facts.url,
        jobTitle: facts.jobTitle,
        description: facts.description,
        worksFor: { "@type": "Organization", name: facts.worksFor },
        sameAs: facts.sameAs,
      },
    ],
  };
}

/** JSON for embedding in a <script> tag without letting it close the tag. */
export const toScriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c");
