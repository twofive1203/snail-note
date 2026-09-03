# 接入已有 Markdown 文件夹

Snail Note 不执行导入、复制或格式转换。接入已有笔记本，就是让 `NOTEBOOK_ROOT` 指向该目录。

## 本地运行

1. 先备份笔记目录。
2. 设置环境变量，例如：

```powershell
$env:NOTEBOOK_ROOT = "D:\Notes"
$env:NOTEBOOK_NAME = "我的笔记本"
pnpm dev
```

也可以复制根目录的 `.env.example` 为 `.env` 后修改。路径必须存在且必须是目录。

## Docker Compose

在项目根目录的 `.env` 中设置宿主机路径：

```dotenv
NOTEBOOK_HOST_PATH=D:/Notes
NOTEBOOK_NAME=我的笔记本
```

然后运行：

```bash
docker compose up -d --build
```

Compose 将宿主机目录挂载到容器内的 `/notes`，服务端的 `NOTEBOOK_ROOT` 也固定为 `/notes`。

## 文件规则与风险

- 文件树和搜索仅处理 `.md` 文件；其他附件不会在 MVP 文件树中显示。
- 符号链接不会被扫描，以避免越过笔记本根目录。
- 保存会直接覆盖原文件；重命名、移动和删除也直接作用于真实文件。
- 非空目录不会被删除，目标已存在时不会覆盖。
- 当前 MVP 没有登录认证，只应部署在可信本机或内网，外网暴露前必须增加认证、HTTPS 和访问控制。
