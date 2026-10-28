import type { APIRoute } from "astro";
import { profileMarkdown } from "@/lib/content";

export const GET: APIRoute = () =>
  new Response(profileMarkdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
