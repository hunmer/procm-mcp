# procm room demo

Start procm-mcp on port 7331, then launch both demo processes with the same room:

```powershell
npm install --prefix "demo/node-server"
pnpm --dir "demo/electron-client" install
pnpm --dir "demo/electron-client" rebuild electron

$env:PROCM_WS_URL="ws://127.0.0.1:7331/room"
$env:PROCM_ROOM_ID="room-demo"
npm --prefix "demo/node-server" start
pnpm --dir "demo/electron-client" start
```

When started through procm-mcp with `roomId: "room-demo"`, the connection variables are injected automatically. The Electron UI waits for the backend's retained `backend:ready` message, sends ping requests, subscribes to replies, and displays structured Logger messages.
