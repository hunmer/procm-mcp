# procm-mcp dashboard

The web UI for procm-mcp, served by the Node backend at `GET /`. Built with
React, Vite, Tailwind CSS v4, and [coss](https://coss.com/ui) UI components
(which sit on Base UI).

It talks to the same-origin REST API under `/api/*` (see the project root
`README.md`). The backend serves the built bundle from `dashboard/dist`, so this
folder is a separate Vite project with its own `package.json`.

## Scripts

From the **project root**:

```bash
npm run build:dashboard   # build this project -> dashboard/dist
npm run dev:dashboard     # Vite dev server (HMR), talks to a running backend
```

From inside `dashboard/`:

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # production build to dist/
npm run preview  # preview the production build
```

### Dev workflow against a running backend

The dev server runs on a different origin (5173) than the backend (e.g. 7331),
so API calls (`/api/...`) must reach the backend. Start the backend, then point
the dev server at it. For local development you can run the backend with
`PROCM_HTTP_PORT` or `--port`, and either proxy API requests in `vite.config.ts`
or simply build and let the backend serve the bundle.

## Stack

- **React 19** + **Vite 6**
- **Tailwind CSS v4** (via `@tailwindcss/vite`) — design tokens live in
  `src/index.css` (`:root` light + `.dark` dark theme)
- **coss** components in `src/registry/default/ui/*` (copied from the coss
  registry), composed through the `@/registry/default/*` import alias
- **Base UI** (`@base-ui/react`) as the primitive layer under coss

## Layout

The dashboard is dark-themed by default (`main.tsx` adds the `dark` class).

- **New process** opens a coss **Dialog** (`NewProcessDialog.tsx`) with the
  start-process form (header outside the form, `form.contents` wrapping the
  panel + footer — the coss form-in-dialog invariant).
- **Logs** open as an **inline right column** (`LogPanel.tsx`) that squeezes the
  left process list in a flex split — not an overlay/drawer.

## Adding more coss components

The component files under `src/registry/default/ui/` are vendored from the coss
registry (GitHub: `cosscom/coss`, `apps/ui/registry/default/ui/*.tsx`). To add
another primitive, fetch its source and its transitive imports (e.g.
`scroll-area`, `spinner`, `lib/utils`) and drop them under the same paths.
