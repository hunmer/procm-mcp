# Mira 真实页面 UI 自动化测试 Handoff

## 目标

通过 `procm-mcp custom-execution` 调用已经运行的 Mira Electron Renderer，在当前页面真实 DOM 上执行 UI 操作，并在操作结束后按时间窗口收集日志。

当前共 **28 个测试**（P0 基础交互 18 个 + P1 数据依赖型 10 个），覆盖：文件夹/标签增删改、tab 操作与右键菜单、分类切换、侧边栏折叠/搜索、主题、设置导航、视图模式/排序、布局对话框、URL 导入校验、媒体选择/右键设置归属、回收站安全断言、图片预览键盘导航、标题筛选、保存过滤器、最近添加跳转、详情面板星标/标签。

这不是 jsdom 挂载测试。测试函数运行在 Mira Electron Renderer 的现有页面中。

## 相关文件

- `/Users/Zhuanz/Documents/mira/packages/mira-client/src/renderer/procm-ui-tests/`
  - `index.ts`：注册表。`export { fn } from './<name>'` + `uiTests` 对象注册，并挂载 `window.__procmUiTests`（仅 DEV）与面板桥接。
  - 每个测试一个独立文件（如 `createFolder.ts`、`mediaSelection.ts`），导出 async 函数。
  - `helpers.ts`：共享工具——`ensureMediaTab(contentSelector)`（媒体 tab 前置）、`getMiraSdk()`（数据查询/清理）。
  - `panel-bridge.ts`：UI 测试面板的 BroadcastChannel 桥（协议 hello/tests/run/log/result）。
- `/Users/Zhuanz/Documents/mira/packages/mira-client/src/main/services/ProcmService.ts`
  - 暴露 `mira-client` custom-execution target，转发到当前 BrowserWindow 的 `webContents`。
- `/Users/Zhuanz/Documents/mira/packages/mira-client/scripts/test-ui.mjs`
  - Node 侧通用驱动脚本：`node scripts/test-ui.mjs <testName> [jsonArgsArray]`，裸跑列出全部测试名。
- `/Users/Zhuanz/Documents/mira/packages/mira-client/public/ui-test-panel.html`
  - UI 测试面板（自包含 HTML）：按钮网格 + 日志区，BroadcastChannel 调主窗口执行。
- `/Users/Zhuanz/Documents/mira/packages/mira-client/src/renderer/views/HomeView/HomeHeader.vue`
  - 头像菜单内 DEV 专属「UI 测试面板」入口，经 `window:open-url` IPC 开新 BrowserWindow。
- `/Users/Zhuanz/Documents/mira/packages/mira-client/src/renderer/main.ts`
  - 仅开发环境动态加载 `./procm-ui-tests`（目录 index）。

## 两种运行方式

### 方式一：CLI（适合单测/CI）

```bash
cd /Users/Zhuanz/Documents/mira/packages/mira-client
pnpm run test:ui:remote <testName>        # 如 toggleSidebarSection
pnpm run test:ui:remote createFolder '["指定文件夹名"]'   # 带参数
pnpm run test:ui:remote                   # 裸跑列出全部测试名
```

### 方式二：UI 测试面板（适合交互式逐个跑）

主窗口头像菜单 →「UI 测试面板」（仅 DEV 显示）→ 新窗口自动握手获取测试列表 → 点按钮执行，按钮显示 ✔/✖，日志区实时输出（含测试内 `console.info('[procm-ui-test] ...')`，执行期间 console 被桥接劫持转发）。

## 添加一个新的 UI 测试

1. 新建 `procm-ui-tests/<name>.ts`，导出 async 函数。参考 `createFolder.ts`：
   - 只用 `screen` / `fireEvent` / `waitFor` / `userEvent` / `document.querySelector`，**不要调用 `render()`**（会创建独立容器，不操作当前页面）；
   - 界面为简体中文，文本匹配用中英文兼容正则；选择器优先 data-* > role/aria > title > 文本；同多元素时用 class/容器收窄；
   - 错误信息英文；开始/结束 `console.info('[procm-ui-test] <name> started/finished')`；
   - 测试必须自清理：关对话框、还原状态、删造的数据，结束后页面状态与开始一致。
2. 在 `index.ts` 注册两处（export 行 + `uiTests` 对象加键）。面板与 CLI 均以该注册表为准，无需改面板代码。
3. 构建 + 重启（见下），面板中自动出现新按钮。

## 数据安全与副作用策略（P1 确立）

- **可逆操作**（选中态、筛选、星标、折叠）：执行并在结束时还原。
- **可还原操作**（改文件归属/标签、重命名）：先用 `getMiraSdk()` 记录原值，测后优先同一 UI 流程还原，SDK API 兜底（如 `folders().setFileFolder({ folder: 原值 | null })`）。
- **不可逆操作**（回收站恢复/彻底删除/清空）：**只断言按钮存在可用，绝不点击执行**；确认对话框只测「取消」分支（见 `trashRestore.ts`）。
- 造数/清理通用模式：`window.miraSDK` → `getLibraries()` → 逐库查询 → delete/update → `window.dispatchEvent(new Event('refresh-folders'))`（参考 `tabContextMenu.ts`）。注意 fileId 仅库内唯一。
- 数据型测试前置不足时抛明确英文错误（如 `library must contain at least 2 media files`），不自行造数据。

## 运行前提

Mira client 必须由全局 `procm-mcp` 管理器启动，并加入同一个 room。当前配置使用：

- 全局管理器 HTTP/MCP：`http://127.0.0.1:7331`
- 全局管理器注入的 WebSocket：`ws://127.0.0.1:7331/room`
- room：`mira-dev`
- UI target：`mira-client`

注意：虽然当前项目也有 7332 实例，但全局管理器启动的 Mira client 会被注入 7331 的 WebSocket 地址。测试驱动脚本默认连接 7331，不能随意改成 7332，否则会连接到没有 Mira target 的 room。

UI 测试面板依赖 BroadcastChannel 同源通信：dev 下主窗口与面板同为 vite dev server origin，可用；生产构建不注册测试与入口（`file://` origin 为 null，BroadcastChannel 也不可用）。

## 标准运行步骤

1. 修改 Renderer/Main 代码后，先构建 Mira client：

   ```bash
   cd /Users/Zhuanz/Documents/mira/packages/mira-client
   pnpm run build:all
   ```

   （只改 `procm-ui-tests/` 下的 renderer 文件时 `pnpm run build` 即可。）

2. 通过全局 `procm-mcp` 重启 Mira client，让 Main 和 Renderer 加载新代码。不要直接手工启动常驻 Electron 进程。

3. 确认进程日志中出现：

   ```text
   procm room enabled {"roomId":"mira-dev"}
   ```

4. 执行真实 UI 测试（CLI 或面板二选一，见上）。

5. CLI 成功输出示例：

   ```json
   {
     "ok": true,
     "result": { "...": "..." },
     "logs": []
   }
   ```

测试脚本支持覆盖连接配置：

```bash
PROCM_ROOM_ID=mira-dev \
PROCM_WS_URL=ws://127.0.0.1:7331/room \
PROCM_UI_TARGET=mira-client \
pnpm run test:ui:remote <testName>
```

## 日志收集

SDK 提供：

```ts
const logs = await collectLogs(client, {
  startTime,
  endTime,
  count: 500,
})
```

`startTime` 和 `endTime` 是 Unix 毫秒时间戳，边界包含。推荐在执行 UI 测试前后记录时间：

```ts
const startTime = Date.now()
const result = await executeCustom(client, 'mira-client', executeUiTest, args)
const endTime = Date.now()
const logs = await collectLogs(client, { startTime, endTime })
```

日志来源必须经过 Mira/procm 的结构化日志链路。普通 Renderer `console.info()` 是否进入 room，取决于当前 Electron console hook 和 logger 配置；UI 测试面板的日志不走这条链路（BroadcastChannel 直连），如需结构化留存请在 Main 侧使用已配置的 procm logger。

## 常见故障

### `procm roomId is required`

脚本未拿到 room 配置。设置：

```bash
PROCM_ROOM_ID=mira-dev PROCM_WS_URL=ws://127.0.0.1:7331/room pnpm run test:ui:remote <testName>
```

### `waitFor timed out`

优先检查：

1. Mira client 是否由全局 procm-mcp 启动。
2. 进程日志是否有 `roomId: mira-dev`。
3. 测试脚本是否连接 `7331/room`。
4. `PROCM_UI_TARGET` 是否为 `mira-client`。
5. Renderer 是否已重新加载包含新测试的代码（`window.__procmUiTests` 是否含目标键，可在面板握手列表或 DevTools 里核对）。

### Testing Library 找到多个元素

选择器过宽。不要使用 `/folder/i` 这类通用正则；用 title、role、class、`data-*` 或容器范围缩小目标。

### 面板一直「连接主窗口…」

主窗口未注册 `__procmUiTests`（非 DEV 构建 / 未重启加载新代码），或主窗口与面板不同源。面板每 1.5s 重试握手。

### 测试成功但 CLI 日志为空

不代表测试失败，只说明时间窗口内没有被结构化收集的日志。先检查 `result.ok` 和页面状态；面板方式可直接看到 console 转发日志。

### user-event v14 注意事项

`click()` 不接收 `{ modifiers }`（那是 v13 API）。ctrl/shift 组合键用 `user.keyboard('[ControlLeft>]')` 按住 → `user.click` → `[/ControlLeft]` 释放（见 `mediaSelection.ts`）。

## 已知限制与遗留问题

- 测试只在开发环境注册，生产构建不暴露 `window.__procmUiTests`，测试面板入口同样仅 DEV。
- custom-execution 使用远程函数求值，只能在完全信任的本地 room 使用。
- `user-event` 模拟真实 DOM 事件，不等同于操作系统级鼠标坐标、原生菜单或文件选择器测试。
- **`folderTreeSearch` 当前必败（应用回归）**：侧边栏传 `hide-header`（`SidebarModuleList.vue` 的 FolderTreeComponent 调用处）导致搜索 input 宿主 `FolderTreeHeader` 被隐藏，「搜索文件夹」按钮只切换高亮、输入框永不渲染。测试按预期契约编写，当前失败即回归证据；修复应用后测试即通过。
- `tabContextMenu` 的「关闭其他标签页」只断言菜单项可用、不真正执行（会关闭用户 tab 且无法还原）。
- `mediaSetFolderTag`：Popover 树无「移出文件夹」入口，目标文件原属「无文件夹」且 SDK 兜底不可用时降级为只断言 Popover 渲染（结果中 `degraded` 字段说明）。
- 单独运行 `createFolder` / `createTag` 会在真实素材库残留数据（文件顶部注释已注明）；自清理的替代：`deleteFolderDialog`（创建→删除闭环）、`tabContextMenu`（SDK 清理）。
- 28 个测试的选择器均经源码核实，但**尚未在真实环境全量实跑**；建议接入专用测试素材库后逐个验证一轮。
