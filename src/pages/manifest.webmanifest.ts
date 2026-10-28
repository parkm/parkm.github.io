import type { APIRoute } from "astro";
import { facts } from "@/lib/content";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        name: facts.name,
        short_name: "Parker",
        start_url: "/map",
        scope: "/",
        // minimal-ui keeps a back button.
        display: "minimal-ui",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/manifest+json" } },
  );
