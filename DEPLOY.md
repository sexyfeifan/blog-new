# 🏝️ sexyfeifan 的博客系统部署指南

基于 [mdddj/blog-new](https://github.com/mdddj/blog-new) 的全栈博客系统，使用 Docker 一键部署。

## 架构

```
┌─────────────────────────────────────────────┐
│  Nginx (反向代理)                              │
│  :80 → 前端 :3000 + 后端 :8088               │
├──────────────────────┬──────────────────────┤
│  Next.js 前端         │  Rust 后端 API        │
│  sexyfeifan/          │  sexyfeifan/          │
│  blog-frontend        │  blog-backend         │
├──────────────────────┼──────────────────────┤
│  PostgreSQL           │  Redis                │
│  (数据库)              │  (缓存)               │
├──────────────────────┴──────────────────────┤
│  RustFS (S3 兼容文件存储)                      │
└─────────────────────────────────────────────┘
```

## 前置要求

- Docker 20.10+ 和 Docker Compose v2
- 至少 2GB 内存
- 一个域名（可选，可用 IP 直接访问）

## 快速部署（3 步）

### 1. 克隆项目

```bash
git clone https://github.com/sexyfeifan/blog-new.git
cd blog-new
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，**必须修改以下项**：

```bash
# 数据库密码（必须修改！）
POSTGRES_PASSWORD=你的安全密码

# JWT 密钥（必须修改！生成随机字符串）
JWT_SECRET=你的JWT密钥至少32位随机字符串

# RustFS 密码（必须修改！）
RUSTFS_SECRET_KEY=你的RustFS密码
RUSTFS_ACCESS_KEY=你的RustFS用户名

# 前端 API 地址（部署后改为你的服务器地址）
NEXT_PUBLIC_API_URL=http://你的服务器IP:8088/api/v1
```

生成随机密钥：
```bash
# macOS
openssl rand -base64 32

# Linux
head -c 32 /dev/urandom | base64
```

### 3. 启动服务

```bash
docker compose up -d
```

等待所有服务启动（约 1-2 分钟），然后访问：
- 博客首页：`http://你的服务器IP`
- 后台管理：`http://你的服务器IP/admin`
- API 文档：`http://你的服务器IP:8088/api/v1`

## 默认账号

首次启动后，需要创建管理员账号：

```bash
# 进入后端容器
docker exec -it blog-backend ./blog-backend create-admin

# 按提示输入用户名和密码
```

## 常用命令

```bash
# 查看所有服务状态
docker compose ps

# 查看日志
docker compose logs -f           # 所有服务
docker compose logs -f backend   # 只看后端
docker compose logs -f frontend  # 只看前端

# 重启所有服务
docker compose restart

# 重启单个服务
docker compose restart backend

# 停止所有服务
docker compose down

# 停止并删除数据（危险！）
docker compose down -v

# 更新镜像并重启
docker compose pull
docker compose up -d

# 重新构建镜像
docker compose build --no-cache
docker compose up -d
```

## 使用自己的 Docker Hub 镜像

如果你想使用自己构建的镜像（方便定制）：

```bash
# 1. 登录 Docker Hub
docker login

# 2. 构建镜像
docker build -t sexyfeifan/blog-backend:latest ./backend
docker build -t sexyfeifan/blog-frontend:latest ./frontend

# 3. 推送到 Docker Hub
docker push sexyfeifan/blog-backend:latest
docker push sexyfeifan/blog-frontend:latest

# 4. 在服务器上拉取并启动
docker compose pull
docker compose up -d
```

## 部署到 NAS（Synology/QNAP）

### Synology DSM 7

1. 安装 Container Manager（Docker 套件）
2. 将项目文件夹上传到 NAS
3. SSH 进入 NAS：
   ```bash
   cd /volume1/docker/blog-new
   cp .env.example .env
   # 编辑 .env
   docker compose up -d
   ```
4. 在 Container Manager 中可以看到所有容器

### QNAP Container Station

1. 打开 Container Station
2. 创建 → 应用 → 从 docker-compose.yml 创建
3. 上传 docker-compose.yml 和 .env
4. 启动

## 部署到云服务器

### Ubuntu/Debian

```bash
# 1. 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录

# 2. 克隆项目
git clone https://github.com/sexyfeifan/blog-new.git
cd blog-new

# 3. 配置
cp .env.example .env
nano .env  # 编辑配置

# 4. 启动
docker compose up -d

# 5. 配置 Nginx 反向代理（可选，用于域名访问）
# 编辑 nginx.conf 或使用 Caddy/Traefik
```

### 配置域名 + HTTPS

推荐使用 Caddy 自动 HTTPS：

```bash
# 安装 Caddy
sudo apt install caddy

# 编辑 /etc/caddy/Caddyfile
blog.yourdomain.com {
    reverse_proxy localhost:80
}
```

或者修改 `nginx.conf` 添加 SSL 配置。

## 数据备份

```bash
# 备份数据库
docker exec blog-postgres pg_dump -U bloguser blog > backup_$(date +%Y%m%d).sql

# 备份文件存储
docker run --rm -v blog-new_rustfs_data:/data -v $(pwd):/backup alpine tar czf /backup/rustfs_$(date +%Y%m%d).tar.gz /data

# 恢复数据库
cat backup_20260611.sql | docker exec -i blog-postgres psql -U bloguser blog
```

## 更新博客系统

```bash
# 拉取最新代码
git pull

# 如果有新的 Docker 镜像
docker compose pull
docker compose up -d

# 如果需要重新构建
docker compose build --no-cache
docker compose up -d
```

## 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 80 | Nginx | 博客首页（可通过 HTTP_PORT 修改） |
| 3000 | Next.js | 前端（内部） |
| 8088 | Rust API | 后端 API |
| 5432 | PostgreSQL | 数据库 |
| 6379 | Redis | 缓存 |
| 9000 | RustFS API | 文件存储 API |
| 9001 | RustFS Console | 文件存储管理面板 |

## 故障排查

```bash
# 服务无法启动
docker compose logs backend | tail -20

# 数据库连接失败
docker compose logs postgres | tail -20

# 前端白屏
docker compose logs frontend | tail -20

# 端口被占用
lsof -i :80
lsof -i :8088

# 重置所有数据
docker compose down -v
docker compose up -d
```

## 项目结构

```
blog-new/
├── backend/              ← Rust 后端
│   ├── src/              ← 源代码
│   ├── migrations/       ← 数据库迁移
│   └── Dockerfile
├── frontend/             ← Next.js 前端
│   ├── src/              ← 源代码
│   └── Dockerfile
├── docker-compose.yml    ← 开发环境
├── docker-compose.prod.yml ← 生产环境
├── .env.example          ← 环境变量模板
├── deploy.sh             ← 部署脚本
└── DEPLOY.md             ← 本文件
```
