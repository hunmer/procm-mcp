# 常见问题（FAQ）

## Q1: 为什么改了 TS 源码运行后没生效？
`build/` 才是运行入口（`build/index.js`）。改完必须 `npm run build`（或 `npm run watch`）。CLI 与测试脚本也都先 build。

## Q2: import 报错 `Cannot find module './xxx.js'`？
Node16 ESM 要求 import 路径带 `.js` 后缀，**即便源文件是 `.ts`**。写 `import { x } from "./foo.js"`（对应 `foo.ts`）。

## Q3: `start-process` 总被拒绝？
检查：(1) 是否开了 `--allow-all`；(2) `allow-start-process` 放行的三元组是否与启动请求**完全一致**——`script` 全等、`args` 逐位全等、`cwd` 全等。`start-procm-command` 的 `cwd` 是相对项目目录解析后的**绝对路径**，要按它去 allow。

## Q4: `.mcp.json` 里的 `--secure` 是什么？
仓库根 `.mcp.json` 示例写了 `"args": ["./build/index.js", "--secure"]`，但 `index.ts` 的 `parseArgs` **不识别 `--secure`**（会静默忽略，无报错也无效果）。当前有效的安全 flag 是 `--allow-all`（反向，关闭 gate）。若需 token 鉴权用 `PROCM_HTTP_TOKEN`。这是一个文档/示例与实现不一致的点，改动时注意。

## Q5: dashboard 打不开 / 显示「未构建」？
后端找不到 `dashboard/dist` 时 `GET /` 返回提示页。从源码运行需先 `npm run build:dashboard`（或 `npm run build:all`）。从 npm 安装的包已内置 dist。dist 解析顺序：`build/` 同级的 `../../dashboard/dist`，再回退 `cwd/dashboard/dist`。

## Q6: 进程停不掉 / 杀不干净？
默认 SIGTERM，10 秒未退出强制 SIGKILL。Windows 上 SIGTERM 不支持，直接 SIGKILL（`taskkill /T /F`）以杀掉 `cmd /c` 子树。若仍残留，检查子进程是否脱离进程树（如 daemon 化、setsid）——`tree-kill` 只能杀进程树内成员。

## Q7: 多个 procm-mcp 进程能共享进程列表吗？
**不能**。进程列表是每个 server 进程的内存单例，`serverId` 各自独立。CLI 客户端只能连指定端口的那个后端。但 `allowed-process-creations.json` 在 `<tmpdir>/procm-mcp/` 下（`serverId` 上一级），是**跨 server 共享**的（注意并发写无锁，见 testing-and-quality）。

## Q8: stdout/stderr 没被捕获？
`start-process` 工具描述明确警告：不要启动「不会自动退出」的后台进程且期望捕获输出——实际上子进程 stdout/stderr 是会被 `ProcessStdoutClient` 捕获的；该警告更像是提示「别启动失控的长寿进程」。若确实没日志，检查子进程是否把输出重定向走了、或缓冲（pipe 未 flush）。

## Q9: `/mcp` 和 stdio 的工具有区别吗？
**没有**，都是同样 14 个工具，由同一组 `register*Tools` 注册。`/mcp` 是 stateless（每请求新建 transport+server），但状态在模块单例里，所以与 stdio/REST/dashboard 一致。allow-x 在 `/mcp` 上**同样生效**（与 dashboard 不同）。

## Q10: 日志怎么清理？
当前**无自动清理/轮转**。日志文件在 `<tmpdir>/procm-mcp/<serverId>/processes/`，随 server 重启会换新 `serverId`（旧目录残留）。长期运行高输出进程会让 lowdb JSON 膨胀（每次 top/search 读全文件）。需要时手动删该目录。
