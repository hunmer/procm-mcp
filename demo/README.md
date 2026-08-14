# procm room demo

Start procm-mcp on port 7331, then launch both demo processes with the same room:

```powershell
npm install --prefix "demo/node-server"
pnpm --dir "demo/electron-client" install
pnpm --dir "demo/electron-client" rebuild electron

npm --prefix "demo/node-server" start
pnpm --dir "demo/electron-client" start
```

Both start commands load `.env.defaults`, which uses room `room-demo` and `ws://127.0.0.1:7331/room`. Existing environment variables take precedence when another room or backend is needed.

When started through procm-mcp with `roomId: "room-demo"`, the connection variables are injected automatically. The Electron UI waits for the backend's retained `backend:ready` message, sends ping requests, subscribes to replies, and displays structured Logger messages.
