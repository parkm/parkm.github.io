---
name: new-demo
description: Scaffold a new demo page from a plain-English idea. Just describe what you want to build.
argument-hint: <idea>
allowed-tools: Read, Write, Glob
disable-model-invocation: true
---

The user wants to build a demo. Their idea: $ARGUMENTS

From this idea, infer:

- **kebab-case page name** — short, URL-friendly (e.g. `bouncing-ball`)
- **PascalCase component name** — derived from the page name (e.g. `BouncingBall`)
- **title** — short human-readable title
- **description** — one sentence describing the demo
- **icon** — a single fitting emoji

## Rules

- Never overwrite existing files — check with Glob first, abort if either exists
- Named exports only (no default exports)
- All demo logic goes in the React component, not the Astro page

## Step 1 — Check for conflicts

Glob `src/pages/<name>.astro` and `src/components/<Name>/<Name>.tsx`. If either exists, stop and tell the user.

## Step 2 — Create `src/pages/<name>.astro`

```astro
---
export const title = "<title>";
export const description = "<description>";
export const icon = "<icon>";

import Layout from "../layouts/Layout.astro";
import { <Name> } from "../components/<Name>/<Name>.tsx";
---

<Layout title={title} description={description}>
  <<Name> client:only="react" />
</Layout>
```

## Step 3 — Create `src/components/<Name>/<Name>.tsx`

Write a minimal but working React scaffold for the idea. Use `useState`/`useEffect`/`useRef` as needed. Keep it self-contained — all demo code lives here.

Structure:

```tsx
import { useState } from "react";

export function <Name>() {
  // state and logic here

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
      {/* demo here */}
    </div>
  );
}
```

## Step 4 — Report

Tell the user the two file paths created and the local URL: `http://localhost:4321/<name>`
