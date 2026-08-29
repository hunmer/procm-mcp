# Browser Integration

The SDK publishes a single browser ESM bundle at
`packages/procm-sdk/dist/browser.js`. Build it with `npm run build:sdk`, then
serve the `dist` directory from the same origin as the page.

Use a native module script and pass room credentials explicitly. Do not expose
room tokens in browser code unless the room is intentionally public:

```html
<script type="module">
  import {
    createProcmClient,
    setupLogger,
  } from "/sdk/browser.js";

  const client = createProcmClient({
    roomId: "room-demo",
    url: "ws://127.0.0.1:7331/room",
    clientName: "browser-app",
  });

  const logger = setupLogger({
    client,
    clientName: "browser-app",
    onLog: (entry) => document.body.dataset.lastLog = `${entry.level}: ${entry.message}`,
  });

  client.onState((state) => logger.info("Room state changed", { state }));
</script>
```

The package export `@hunmer/procm-mcp-sdk/browser` resolves to the same bundle
for bundler-based browser applications. A runnable page is available at
`demo/browser/index.html`; serve the repository root and open
`/demo/browser/`.
