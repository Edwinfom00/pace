<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.


## Pace brand

The approved Pace logo assets in `public/brand/pace-logo.svg` (full lockup) and `public/brand/pace-icon.svg` (icon) are the product's canonical logo assets.

Do not redesign, regenerate, reinterpret, recolor or replace it without explicit approval.

All product surfaces must use the shared `PaceLogo` component instead of recreating the logo manually.

## Dialogs

Use the shared `ResponsiveDialog` primitives for product dialogs. Do not import the base `Dialog` primitives directly in product surfaces.

## Code comments

Do not add comments by default. This includes line comments, block comments and JSDoc on types, props, functions and fields.

A comment is allowed only when the code cannot be understood without it, for example a non-obvious invariant, a safety or financial-correctness constraint, or a workaround for a library bug. Never add a comment that describes what the code, a prop or a type already says. When in doubt, leave it out.

<!-- END:nextjs-agent-rules -->
