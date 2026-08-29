# procm-mcp 手动调试练习

[English](README.md) | 简体中文

这是一个故意保留计算 Bug 的 Node.js HTTP 服务，用来体验以下闭环：

1. 安装并连接 procm-mcp。
2. 初始化项目命令。
3. 通过 procm-mcp 启动服务。
4. 在页面触发错误。
5. 让 Agent 读取日志、添加调试信息并修复。
6. 再次点击页面按钮完成验证。

示例只使用 Node.js 内置模块，业务代码没有引入 procm SDK。请不要提前修复 `server.js` 中的 Bug。

## 环境要求

- Node.js 18 或更高版本
- 支持 MCP 和项目 Skill 的 AI 编程 Agent

以下命令均在本目录 `teach/sample` 中执行。

## 1. 安装 procm-mcp

安装 procm-mcp 到当前练习项目：

```bash
npm install --global @hunmer/procm-mcp
```

安装项目初始化和进程管理 Skill：

```bash
npx skills add hunmer/procm-mcp --skill procm-mcp procm-mcp-init -y
```

按照你使用的 Agent 的 MCP 配置方式，将本项目中的服务入口注册为 MCP server：

```json
{
  "mcpServers": {
    "procm-mcp": {
      "command": "procm-mcp",
      "env": {}
    }
  }
}
```

配置完成后，重新加载 Agent，确认它可以看到 procm-mcp 的进程和日志工具。

## 2. 让 Agent 初始化项目

将下面这句话发给 Agent：

> 请初始化当前项目的 procm-mcp 命令，读取 package.json 中的启动脚本，先展示建议，再创建 procm-commands.json。不要启动服务。

确认 Agent 生成的 `procm-commands.json` 包含一个执行 `npm start` 的命令。

## 3. 通过 procm-mcp 启动服务

将下面这句话发给 Agent：

> 请通过 procm-mcp 启动当前项目的 start 命令，不要直接在终端启动。启动后读取最近日志，告诉我进程 ID 和访问地址。

默认访问地址应为 <http://127.0.0.1:3000>。不要关闭 Agent 托管的服务。

## 4. 手动触发错误

1. 浏览器打开 <http://127.0.0.1:3000>。
2. 点击“计算总价”。
3. 确认页面显示 HTTP 500 返回的错误名称、错误消息和调用栈。

## 5. 让 Agent 读取证据并修复

不要复制页面错误或终端日志，直接将下面这句话发给 Agent：

> 我刚才点击“计算总价”后页面报错了。请读取该服务最近的 stdout 和 stderr，定位这次错误；先在关键输入和计算位置添加必要的调试输出，通过 procm-mcp 重启服务，然后让我再次点击以收集日志。根据新日志修复根因，再通过 procm-mcp 重启服务并检查启动日志。不要添加 procm SDK。

Agent 要先从 procm-mcp 获取错误证据，再修改代码。按 Agent 提示再次点击按钮，让它读取新增的调试日志并完成修复。

## 6. 手动验证修复

1. 刷新 <http://127.0.0.1:3000>。
2. 再次点击“计算总价”。
3. 确认页面返回 `ok: true`，总价为 `497`。
4. 告诉 Agent：“我已点击并验证成功，请读取最新日志确认没有新的 error，并停止该服务。”

完成后，你应当体验到由 procm-mcp 串联的完整过程：托管启动、读取错误日志、重启、再次收集调试信息、修复和停止服务。
