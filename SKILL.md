# Blog-New 部署技能 (Skill)

> 本文件供 AI 工具快速理解项目架构和部署流程，避免搭建错误。

## 项目概述

全栈博客系统，Docker 一键部署。

| 组件 | 技术栈 | 镜像 |
|------|--------|------|
| 前端 | Next.js + animal-island-ui | `sexyfeifan/blog-frontend:latest` |
| 后端 | Rust (Axum) + PostgreSQL | `sexyfeifan/blog-backend:latest` |
| 数据库 | PostgreSQL 15 | `postgres:15-alpine` |
| 缓存 | Redis 7 | `redis:7-alpine` |
| 文件存储 | RustFS (S3 兼容) | `rustfs/rustfs:latest` |
| 反向代理 | Nginx | `nginx:alpine` |

## 端口规划

| 端口 | 服务 | 说明 |
|------|------|------|
| 3900 | Nginx | 博客首页 + 后台管理（避免 80 被占） |
| 3901 | Rust API | 后端 API（避免 8080 被占） |
| 5432 | PostgreSQL | 数据库（内部） |
| 6379 | Redis | 缓存（内部） |
| 9000 | RustFS API | 文件存储（内部） |
| 9001 | RustFS Console | 文件存储面板 |

## 部署流程（5 步）

### 1. 克隆项目
```bash
git clone https://github.com/sexyfeifan/blog-new.git
cd blog-new
```

### 2. 配置环境变量
```bash
cp .env.example .env
```

`.env` 必填项：
```bash
POSTGRES_PASSWORD=<随机密码>        # 必须！
JWT_SECRET=<32位随机字符串>          # 必须！openssl rand -base64 32
RUSTFS_SECRET_KEY=<随机密码>        # 必须！
RUSTFS_ACCESS_KEY=<用户名>          # 必须！
HTTP_PORT=3900                      # 避免 80
BACKEND_PORT=3901                   # 避免 8080
NEXT_PUBLIC_API_URL=http://<服务器IP>:3901/api/v1
```

### 3. 启动服务
```bash
docker compose up -d
```

### 4. 创建管理员
```bash
# ⚠️ 不能用 create-admin 命令（会端口冲突），必须用 API：
curl -X POST http://localhost:3901/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","nickname":"Admin"}'
```

### 5. 验证
```bash
docker compose ps                    # 所有容器 healthy
curl http://localhost:3900            # 前端 200
curl http://localhost:3901/api/v1/health  # 后端 healthy
```

## 已知错误及解决方案

### 错误 1: nginx.conf 挂载失败
```
mount src=.../nginx.conf: not a directory
```
**原因：** NAS 编排工具在文件不存在时会创建为目录。
**解决：** 仓库中必须包含 `nginx.conf` 文件（不能是目录）。

### 错误 2: 数据库密码不匹配
```
password authentication failed for user "bloguser"
```
**原因：** 旧数据卷用旧密码创建，新 .env 密码不同。
**解决：** 首次部署必须删除旧卷：
```bash
docker compose down
docker volume rm blog_postgres_data blog_redis_data blog_rustfs_data blog_rustfs_logs
docker compose up -d
```

### 错误 3: 端口被占用
```
Error: Os { code: 98, kind: AddrInUse, message: "Address already in use" }
```
**原因：** 80/8080 被其他服务占用。
**解决：** 改用 3900/3901。

### 错误 4: create-admin 端口冲突
```
Error: Os { code: 98, kind: AddrInUse, message: "Address already in use" }
```
**原因：** `create-admin` 二进制会启动新服务器实例，端口被占。
**解决：** 用 `/api/v1/auth/setup` API 创建管理员。

### 错误 5: MCP token 未初始化
```
{"code":401,"message":"MCP token not initialized"}
```
**原因：** 部分 API 需要 MCP token，首次部署未初始化。
**解决：** `/api/v1/auth/setup` 不需要 MCP token，直接用它创建管理员。

### 错误 6: 前端登录失败 (Unauthorized)
```
Unauthorized: Invalid username or password
```
**原因：** 前端构建时未注入 `NEXT_PUBLIC_API_URL`，请求发到错误地址。
**解决：** 重新构建前端镜像：
```bash
docker build --build-arg NEXT_PUBLIC_API_URL=http://<IP>:3901/api/v1 -t sexyfeifan/blog-frontend:latest ./frontend
docker push sexyfeifan/blog-frontend:latest
# 服务器上
docker pull sexyfeifan/blog-frontend:latest
docker compose up -d
```

### 错误 7: 镜像拉取超时 (429)
```
429 Too Many Requests
```
**原因：** 镜像加速器限流。
**解决：** 等几分钟重试，或切换加速器。

## 关键文件

| 文件 | 作用 |
|------|------|
| `docker-compose.yml` | 开发环境编排 |
| `docker-compose.prod.yml` | 生产环境编排 |
| `.env` | 环境变量（密码、端口、API 地址） |
| `nginx.conf` | Nginx 反向代理配置 |
| `backend/Dockerfile` | 后端镜像构建 |
| `frontend/Dockerfile` | 前端镜像构建（支持 NEXT_PUBLIC_API_URL ARG） |
| `build-and-push.sh` | 构建推送镜像脚本 |
| `deploy.sh` | 部署管理脚本 |
| `DEPLOY_TROUBLESHOOT.md` | 详细排查报告 |

## 前端 Dockerfile 关键点

```dockerfile
# 必须在构建阶段注入 NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
```

Next.js 的 `NEXT_PUBLIC_` 变量在 `next build` 时打包进 JS bundle，运行时修改无效。

## 更新流程

```bash
# 服务器上
cd blog-new
git pull
docker compose pull       # 拉取新镜像
docker compose up -d      # 重启
```

## 数据备份

```bash
# 数据库
docker exec blog-postgres pg_dump -U bloguser blog > backup_$(date +%Y%m%d).sql

# 文件存储
docker run --rm -v blog-new_rustfs_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/rustfs_$(date +%Y%m%d).tar.gz /data
```

## 部署平台

| 平台 | 注意事项 |
|------|----------|
| Ubuntu/Debian | `curl -fsSL https://get.docker.com \| sh` 安装 Docker |
| 群晖 DSM 7 | SSH 登录后操作，Container Manager 图形界面也可 |
| 飞牛 fnOS | 数据卷路径 `/vol1/docker/`，自带 Docker |
| 云服务器 | 配置域名 + Caddy 自动 HTTPS |
