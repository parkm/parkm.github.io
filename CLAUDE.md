# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Astro dev server
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # ESLint + TypeScript type checking
npm run typecheck  # TypeScript type checking only
npm run eslint     # ESLint only
```

Pre-commit hooks run automatically via Husky: Prettier (lint-staged) then full lint.

## Architecture

Personal portfolio/creative experimentation site at [parkermiller.net](https://parkermiller.net).

**Stack:** Astro 6 (file-based routing) + React 19 (interactive islands) + TypeScript + Tailwind CSS 4

**Key libraries:**
- **Tone.js** — Web Audio / synthesizer functionality
- **Tonal** — Music theory helpers (notes, pitches)
- **PixiJS + pixi-filters** — WebGL 2D graphics and visual effects
- **Radix UI** — Accessible UI primitives (checkbox, slider, menubar, etc.)
- **nuqs** — URL search param state management
- **@dnd-kit/sortable** — Drag-and-drop
- **Luxon** — Date/time utilities

**Path alias:** `@/*` maps to `src/*`

**Layouts:**
- `src/layouts/Layout.astro` — Root HTML shell with dark mode detection
- `src/layouts/Tailwind.astro` — Global Tailwind import + design tokens (OKLCH color space, dark mode variants)

**`src/lib/utils/`:**
- `cn.ts` — `clsx` + `tailwind-merge` utility
- `audioInit.ts` — iOS Web Audio API unlock (must be triggered by user gesture before any audio)
- `index.ts` — Re-exports + `clamp` utility

**Pages** (`src/pages/`) map directly to routes. Interactive pages use React components loaded as Astro islands with `client:*` directives.

**Components** (`src/components/`) mix `.astro` and `.tsx` files. `src/components/ui/` holds Radix UI wrappers.

## Deployment

GitHub Actions deploys to GitHub Pages on push to `main` using `withastro/action` + Node 22.
