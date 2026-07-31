## 修复目标
MCP Inspector（浏览器/Electron 环境）连接 `http://127.0.0.1:7331/mcp` 时 `tools/list` 报 "Failed to fetch"。

## 根因（已验证）
1. 服务端 MCP 协议本身正常 —— 直接 curl `POST /mcp` 返回完整 tools/list（4917 字节，所有工具）。
2. **完全缺失 CORS**：
   - `POST /mcp` 响应无任何 `Access-Control-*` 头。
   - `OPTIONS` 预检被 `http-server.ts` 的兜底 404 拦截（OPTIONS 不是 MCP method，未匹配任何路由）。
3. Inspector 对 7331 的请求是跨域（Inspector 源 ≠ 7331）：浏览器先发 OPTIONS 预检 → 404 无 CORS 头 → 预检失败 → block 真正 POST → "Failed to fetch"。
4. SDK 的 `StreamableHTTPServerTransport` 不处理 CORS；底层 hono `getRequestListener` 用 Web Response headers 经 `res.writeHead(status, header)` 覆盖式写入（已读 listener.js 确认），**会覆盖任何提前 `res.setHeader` 的头**。

用户已定 CORS 策略：**反射 Origin**（仅本机 127.0.0.1 可达，风险可控）。

## 实现方案（改 `src/mcp-http.ts`）

### 1. 新增 CORS 头 helper `applyCorsHeaders(req, res)`
- 反射：`Access-Control-Allow-Origin` = 请求的 Origin（无 Origin 头则跳过，本地 curl 场景不需要）。
- `Access-Control-Allow-Methods`: `POST, GET, DELETE, OPTIONS`。
- `Access-Control-Allow-Headers`: `Content-Type, Accept, Authorization`（含 token 鉴权场景）。
- `Access-Control-Allow-Credentials`: `true`（配合反射 Origin，支持 Bearer token）。
- `Vary: Origin`（缓存正确性，反射场景必须）。

### 2. OPTIONS 预检单独处理（修复当前 404）
在 `handleMcpRequest` 中，当 `req.url` 为 `/mcp` 时，**先**判断 OPTIONS：
- 若是 OPTIONS → applyCorsHeaders 后直接 `res.writeHead(204)` + `res.end()` 返回（204 No Content），不再往下走 transport。
- 必须在 `createSession()` 之前处理，避免为预检白建 session。

### 3. 让 MCP 响应也带 CORS 头
hono 会覆盖式 writeHead，提前 setHeader 不可靠。**拦截 `res.writeHead`**：在调用 `transport.handleRequest` 前，monkey-patch `res.writeHead`，包装成"先调原 writeHead，再补 CORS 头"。这样 SDK/SSE/普通响应统一带上 CORS，不依赖其内部实现。
- 包装时保留原返回值（writeHead 返回 res 本身）。
- 仅作用于 /mcp 端点（其他路由 REST/dashboard 无需 CORS，不受影响）。

### 4. 流程
`handleMcpRequest` 新顺序（url=/mcp 时）：
1. applyCorsHeaders(req, res)（写入基础 CORS 头，OPTIONS/POST/GET/DELETE 都需要）
2. 若 OPTIONS → 204 end，return true
3. 若非 isMcpMethod → return false（但已带 CORS 头，无害）
4. createSession
5. 拦截 res.writeHead（补 CORS 头）
6. transport.handleRequest(req, res)

## 验证计划
1. 启动后端 `--server`，curl 模拟 Inspector 行为：
   - `OPTIONS /mcp` 预检 → 应 204 + 完整 CORS 头（Allow-Origin=反射、Allow-Methods、Allow-Headers、Allow-Credentials、Vary）。
   - `POST /mcp` tools/list → 应 200 + SSE body（现有功能不破）+ 响应头含 CORS。
2. 用 `node` 模拟一个带 Origin 头的请求，确认反射正确。
3. 无 Origin 头的请求（curl 默认）不报错、不影响功能。
4. 真实场景：用户用 MCP Inspector 连接，确认 tools/list 正常返回（由用户确认；我用 curl 验证 CORS 协议合规性）。
5. `npm run build` 通过。

## 不改的东西
- REST API（/api/...）和 dashboard（/、/assets/）：不加 CORS（同源，无需；避免扩大攻击面）。
- token 鉴权逻辑：不动（CORS 与 auth 正交，Allow-Headers 已含 Authorization）。
- SDK transport / McpServer 注册：不动。