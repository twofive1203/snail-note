# Snail Note

自托管、Markdown-first 的 Web 笔记 MVP。它直接读取和修改服务器上的真实 `.md` 文件，不使用私有正文格式。

> **重要：** 保存、重命名、移动、删除都会直接修改笔记目录。首次使用前请备份。当前 MVP 不含登录认证，只适合可信本机或内网。

## MVP 能力

- 浏览已有 Markdown 文件夹和多级目录
- 创建、读取、编辑、保存、重命名、移动、删除 `.md` 文件
- 创建、重命名、移动和删除空目录
- CodeMirror 6 Markdown 原文编辑，支持 `Ctrl/Cmd + S` 保存
- 编辑、分屏、预览三种模式；预览内容经过 XSS 清理
- `Ctrl/Cmd + K` 全文搜索并跳转到结果
- 未保存状态和切换确认
- 相对路径校验、目录越界和符号链接逃逸防护

## 技术栈

- pnpm workspace + TypeScript
- Fastify 文件 API
- React + Vite
- CodeMirror 6、Marked、DOMPurify
- Vitest + Testing Library

## 本地开发

要求 Node.js 20+ 和 pnpm 10+。

```bash
pnpm install
```

复制环境变量示例并设置笔记目录：

```powershell
Copy-Item .env.example .env
# 编辑 .env，将 NOTEBOOK_ROOT 改为真实存在的目录
pnpm dev
```

默认地址：

- Web: <http://localhost:5173>
- API: <http://localhost:8787/api/health>

如果不设置 `NOTEBOOK_ROOT`，服务会在当前工作目录创建并使用安全的 `snail-notes/` 默认目录。已有文件夹无需迁移，详细说明见 [接入已有 Markdown 文件夹](docs/usage/import-existing-folder.md)。

## 构建和运行

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

生产启动时，Fastify 会同时提供 `apps/web/dist` 静态文件和 `/api` 接口，默认访问 <http://localhost:8787>。

## Docker Compose

1. 创建 `.env`，配置宿主机笔记目录：

```dotenv
NOTEBOOK_HOST_PATH=D:/Notes
NOTEBOOK_NAME=我的笔记本
```

2. 构建并启动：

```bash
docker compose up -d --build
```

3. 打开 <http://localhost:8787>。

挂载关系是 `${NOTEBOOK_HOST_PATH} -> /notes`，容器内 `NOTEBOOK_ROOT=/notes`。在 Linux/macOS 上可使用 `/home/me/notes` 之类的绝对路径。

## API 概览

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/notebook/tree` | 文件树 |
| `GET/PUT/POST` | `/api/notebook/file` | 读取、保存、创建笔记 |
| `POST` | `/api/notebook/directory` | 创建目录 |
| `PATCH/DELETE` | `/api/notebook/entry` | 移动/重命名、删除 |
| `GET` | `/api/search?q=...` | 内容搜索 |

## MVP 边界

暂不包含登录、多用户协作、附件管理、图片粘贴、双链、标签索引和 SQLite 全文索引。文件系统是正文的唯一真相源。
