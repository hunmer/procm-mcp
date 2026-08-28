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

The backend also serves a matching browser console at `http://127.0.0.1:4444`. Its `/api/electron-data` route uses `executeCustom()` on the connected backend SDK to read the Electron renderer state without exposing room credentials to browser code.

After both demos are connected, run the reusable custom-execution check:

```powershell
npm --prefix "demo" run test:custom-execution
```

The script sends serialized functions through the SDK to the backend and Electron targets. It reads backend process data and the Electron renderer's simulated `#ui-value`. Execution subscriptions are registered only after each target receives the room `welcome` frame and are removed on disconnect. Because this feature evaluates remote code, use it only in authenticated, trusted rooms.
