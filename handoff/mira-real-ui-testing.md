# Mira 真实页面 UI 自动化测试 Handoff

## 目标

通过 `procm-mcp custom-execution` 调用已经运行的 Mira Electron Renderer，在当前页面真实 DOM 上执行 UI 操作，并在操作结束后按时间窗口收集日志。

当前示例验证 `SidebarModuleList.vue` 的创建文件夹流程：

1. 查询真实页面中的侧边栏“添加文件夹”按钮。
2. 点击按钮打开真实的文件夹对话框。
3. 填写真实的 `#folderTitle` 输入框。
4. 点击真实的“创建”按钮。
5. 等待创建出的文件夹名称出现在当前页面 DOM 中。

这不是 jsdom 挂载测试。测试函数运行在 Mira Electron Renderer 的现有页面中。

## 相关文件

- `/Users/Zhuanz/Documents/mira/packages/mira-client/src/renderer/procm-ui-tests.ts`
  - 注册 Renderer UI 测试函数。
  - 使用 `@testing-library/vue` 的 `screen` 查询当前 `document`。
  - 使用 `@testing-library/user-event` 执行点击和输入。
- `/Users/Zhuanz/Documents/mira/packages/mira-client/src/main/services/ProcmService.ts`
  - 暴露 `mira-client` custom-execution target。
  - 将测试请求转发到当前 BrowserWindow 的 `webContents`。
- `/Users/Zhuanz/Documents/mira/packages/mira-client/scripts/test-ui-create-folder.mjs`
  - Node 侧测试驱动脚本。
  - 调用 `executeCustom()` 执行 Renderer 测试。
  - 调用 `collectLogs()` 获取测试时间窗口内的日志。
- `/Users/Zhuanz/Documents/mira/packages/mira-client/src/renderer/main.ts`
  - 仅开发环境动态加载 `procm-ui-tests.ts`。

## 添加一个新的 UI 测试

在 `procm-ui-tests.ts` 中新增函数，并注册到 `window.__procmUiTests`：

```ts
async function openSettings(): Promise<{ visible: boolean }> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /设置|settings/i }))
  await waitFor(() => {
    if (!screen.getByRole('dialog')) throw new Error('settings dialog is not open')
  })
  return { visible: true }
}

if (import.meta.env.DEV) {
  window.__procmUiTests = { createFolder, openSettings }
}
```

编写选择器时优先使用：

- `screen.getByRole()`：按钮、对话框、文本框等有明确语义的元素。
- `screen.getByTitle()` / `screen.getByLabelText()`：页面已有 title 或 label 时使用。
- `document.querySelector()`：只有目标组件没有可用语义属性时使用，例如当前的 `#folderTitle`。

不要在测试函数中调用 `render()`。`render()` 会创建独立测试容器，不会操作当前 Mira 页面。

如果页面有多个相同按钮，使用明确属性过滤。例如侧边栏文件夹按钮：

```ts
const addButton = screen
  .getAllByTitle(/添加文件夹|创建文件夹/i)
  .find((element) => element.classList.contains('header-action-btn'))
```

## 运行前提

Mira client 必须由全局 `procm-mcp` 管理器启动，并加入同一个 room。当前配置使用：

- 全局管理器 HTTP/MCP：`http://127.0.0.1:7331`
- 全局管理器注入的 WebSocket：`ws://127.0.0.1:7331/room`
- room：`mira-dev`
- UI target：`mira-client`

注意：虽然当前项目也有 7332 实例，但全局管理器启动的 Mira client 会被注入 7331 的 WebSocket 地址。测试驱动脚本默认连接 7331，不能随意改成 7332，否则会连接到没有 Mira target 的 room。

## 标准运行步骤

1. 修改 Renderer/Main 代码后，先构建 Mira client：

   ```bash
   cd /Users/Zhuanz/Documents/mira/packages/mira-client
   pnpm run build:all
   ```

2. 通过全局 `procm-mcp` 重启 Mira client，让 Main 和 Renderer 加载新代码。不要直接手工启动常驻 Electron 进程。

3. 确认进程日志中出现：

   ```text
   procm room enabled {"roomId":"mira-dev"}
   ```

4. 执行真实 UI 测试：

   ```bash
   cd /Users/Zhuanz/Documents/mira/packages/mira-client
   pnpm run test:ui:remote
   ```

5. 成功输出示例：

   ```json
   {
     "ok": true,
     "result": {
       "title": "procm-ui-...",
       "visible": true
     },
     "logs": []
   }
   ```

测试脚本也支持覆盖连接配置：

```bash
PROCM_ROOM_ID=mira-dev \
PROCM_WS_URL=ws://127.0.0.1:7331/room \
PROCM_UI_TARGET=mira-client \
pnpm run test:ui:remote
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

日志来源必须经过 Mira/procm 的结构化日志链路。普通 Renderer `console.info()` 是否进入 room，取决于当前 Electron console hook 和 logger 配置；如果需要稳定记录测试步骤，建议在业务测试桥接层或 Main 侧使用已配置的 procm logger。

## 常见故障

### `procm roomId is required`

说明测试脚本没有拿到 room 配置。当前脚本已有默认值；如果是旧代码，设置：

```bash
PROCM_ROOM_ID=mira-dev PROCM_WS_URL=ws://127.0.0.1:7331/room pnpm run test:ui:remote
```

### `waitFor timed out`

优先检查：

1. Mira client 是否是由全局 procm-mcp 启动。
2. 进程日志是否有 `roomId: mira-dev`。
3. 测试脚本是否连接 `7331/room`。
4. `PROCM_UI_TARGET` 是否为 `mira-client`。
5. Renderer 是否已重新加载包含 `window.__procmUiTests` 的开发代码。

### Testing Library 找到多个元素

说明选择器过宽。不要使用 `/folder/i` 这类通用正则；使用 title、role、class 或容器范围缩小目标。

### 测试成功但日志为空

这不代表测试失败，只说明测试时间窗口内没有被结构化收集的日志。先检查 `result.ok` 和页面状态；需要日志时，在测试动作前后输出可被 procm logger 捕获的结构化消息。

## 当前限制

- 测试只在开发环境注册，生产构建不会暴露 `window.__procmUiTests`。
- custom-execution 使用远程函数求值，只能在完全信任的本地 room 使用。
- `user-event` 模拟真实 DOM 事件，不等同于操作系统级鼠标坐标、原生菜单或文件选择器测试。
- 当前创建文件夹测试会在真实素材库中创建 `procm-ui-*` 文件夹，重复执行后应手工清理，或后续接入专用测试素材库和清理步骤。
