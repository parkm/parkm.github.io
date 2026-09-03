// @ts-check
import { defineConfig } from "astro/config";
import fs from "node:fs";
import { URL } from "node:url";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

/**
 * Dev-only: serve `public/<dir>/index.html` for `/<dir>/` requests, and
 * redirect `/<dir>` to `/<dir>/`, matching how GitHub Pages serves the built
 * site. Lets static drop-ins like `public/tetris/` work under `astro dev`.
 * @returns {import("vite").Plugin}
 */
function publicDirIndex() {
  return {
    name: "public-dir-index",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const dir = url.pathname.endsWith("/")
          ? url.pathname
          : `${url.pathname}/`;
        const file = path.join("public", dir, "index.html");
        if (dir === "/" || !fs.existsSync(file)) return next();
        if (!url.pathname.endsWith("/")) {
          res.writeHead(301, { Location: dir + url.search });
          res.end();
          return;
        }
        req.url = `${dir}index.html${url.search}`;
        next();
      });
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: "https://parkermiller.net",

  server: {
    host: true,
  },

  vite: {
    plugins: [tailwindcss(), publicDirIndex()],
  },

  integrations: [react()],
});
