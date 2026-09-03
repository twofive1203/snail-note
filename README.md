# Snail Note

自托管、Markdown-first 的 Web 笔记 MVP。它直接读取和修改服务器上的真实 `.md` 文件，不使用私有正文格式。

> **重要：** 保存、重命名、移动、删除都会直接修改笔记目录。首次使用前请备份。当前 MVP 不含登录认证，只适合可信本机或内网。

## MVP 能力

- 在页面中浏览服务端目录并添加多个笔记本，无需启动前配置根目录
- 在笔记本列表中切换不同 Markdown 文件夹和多级目录
- 创建、读取、编辑、保存、重命名、移动、删除 `.md` 文件
- 创建、重命名、移动和删除空目录
- CodeMirror 6 Markdown 原文编辑，默认 Obsidian 式实时预览（未聚焦行隐藏语法符），源码字节不变
- 实时、源码、分屏、预览四种模式；预览内容经过 XSS 清理；支持 `Ctrl/Cmd + S` 保存
- 实时预览和预览模式渲染 ` ```mermaid ` 代码块
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

直接启动即可，不需要设置笔记根目录：

```powershell
Copy-Item .env.example .env
pnpm dev
```

打开页面后点击左侧“笔记本”旁的 `＋`，浏览并选择服务端机器上的目录。选择结果保存在 `.snail-note/notebooks.json`，重启后会自动恢复。可通过 `SNAIL_NOTE_DATA_DIR` 修改配置存储目录。

默认地址：

- Web: <http://localhost:5173>
- API: <http://localhost:8787/api/health>

已有文件夹无需迁移或转换，详细说明见 [接入已有 Markdown 文件夹](docs/usage/import-existing-folder.md)。为兼容旧配置，首次升级且尚无笔记本配置文件时，已有的 `NOTEBOOK_ROOT` 仍会自动注册为第一个笔记本。

## 构建和运行

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

生产启动时，Fastify 会同时提供 `apps/web/dist` 静态文件和 `/api` 接口，默认访问 <http://localhost:8787>。

## Docker Compose

1. 创建 `.env`，配置包含各个笔记本的宿主机父目录：

```dotenv
NOTEBOOK_HOST_PATH=D:/Notes
```

2. 构建并启动：

```bash
docker compose up -d --build
```

3. 打开 <http://localhost:8787>。

挂载关系是 `${NOTEBOOK_HOST_PATH} -> /notes`。打开页面后可从 `/notes` 下分别选择多个子目录作为笔记本。容器只能浏览已挂载到容器内的目录；如需选择其他宿主机目录，需要先在 `docker-compose.yml` 中增加对应挂载。笔记本列表存储在 Docker 数据卷中。

## API 概览

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `GET/POST` | `/api/notebooks` | 查询、添加笔记本 |
| `DELETE` | `/api/notebooks/:notebookId` | 从列表移除笔记本（不删除文件） |
| `GET` | `/api/directories` | 浏览服务端目录 |
| `GET` | `/api/notebooks/:notebookId/tree` | 指定笔记本的文件树 |
| `GET/PUT/POST` | `/api/notebooks/:notebookId/file` | 读取、保存、创建笔记 |
| `POST` | `/api/notebooks/:notebookId/directory` | 创建目录 |
| `PATCH/DELETE` | `/api/notebooks/:notebookId/entry` | 移动/重命名、删除 |
| `GET` | `/api/notebooks/:notebookId/search?q=...` | 在指定笔记本内搜索 |

## MVP 边界

暂不包含登录、多用户协作、附件管理、图片粘贴、双链、标签索引和 SQLite 全文索引。文件系统是正文的唯一真相源。
