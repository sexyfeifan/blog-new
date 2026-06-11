# 🏝️ sexyfeifan 的博客系统

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

| 服务 | 镜像 | 作用 |
|------|------|------|
| postgres | postgres:15-alpine | 数据库 |
| redis | redis:7-alpine | 缓存 |
| rustfs | rustfs/rustfs:latest | S3 兼容文件存储 |
| backend | sexyfeifan/blog-backend:latest | Rust API 后端 |
| frontend | sexyfeifan/blog-frontend:latest | Next.js 前端 |
| nginx | nginx:alpine | 反向代理 |

## 快速部署

### 1. 克隆项目

```bash
git clone https://github.com/sexyfeifan/blog-new.git
cd blog-new
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，**必须修改以下项**：

```bash
# 数据库密码（必须修改！）
POSTGRES_PASSWORD=你的安全密码

# JWT 密钥（必须修改！至少 32 位随机字符串）
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

等待 1-2 分钟，访问：
- 博客首页：`http://你的服务器IP`
- 后台管理：`http://你的服务器IP/admin`

### 4. 创建管理员

```bash
docker exec -it blog-backend ./blog-backend create-admin
```

---

## 部署到云服务器（Ubuntu/Debian）

### 1. 安装 Docker

```bash
# 一键安装 Docker
curl -fsSL https://get.docker.com | sh

# 将当前用户加入 docker 组
sudo usermod -aG docker $USER

# 重新登录使生效
newgrp docker
```

### 2. 部署博客

```bash
# 克隆项目
git clone https://github.com/sexyfeifan/blog-new.git
cd blog-new

# 配置
cp .env.example .env
nano .env

# 启动
docker compose up -d
```

### 3. 配置域名 + HTTPS（推荐 Caddy）

```bash
# 安装 Caddy
sudo apt install -y caddy

# 配置
sudo nano /etc/caddy/Caddyfile
```

写入：
```
blog.yourdomain.com {
    reverse_proxy localhost:80
}
```

```bash
# 重启 Caddy
sudo systemctl restart caddy
```

Caddy 会自动申请 Let's Encrypt HTTPS 证书。

### 4. 开机自启

Docker Compose 的服务已配置 `restart: unless-stopped`，服务器重启后会自动启动。

---

## 部署到群晖 NAS（Synology DSM 7）

### 方式一：SSH 命令行（推荐）

#### 1. 开启 SSH

群晖 → 控制面板 → 终端机和 SNMP → 启用 SSH 功能

#### 2. SSH 登录

```bash
ssh your-username@your-nas-ip
sudo -i  # 切换到 root
```

#### 3. 安装 Docker（如果未安装）

群晖 DSM 7 自带 Container Manager（Docker），无需额外安装。

#### 4. 部署

```bash
# 进入 Docker 目录
cd /volume1/docker

# 克隆项目
git clone https://github.com/sexyfeifan/blog-new.git
cd blog-new

# 配置
cp .env.example .env
vi .env  # 编辑配置

# 启动
docker compose up -d
```

#### 5. 查看状态

```bash
docker compose ps
docker compose logs -f
```

#### 6. 访问

- 博客：`http://你的NAS-IP`
- 后台：`http://你的NAS-IP/admin`

### 方式二：Container Manager 图形界面

1. 打开 **Container Manager**（套件中心安装）
2. **项目** → **新建** → **从 docker-compose.yml 创建**
3. 上传 `docker-compose.yml` 和 `.env` 文件
4. 点击**下一步** → **完成**
5. 项目启动后在 **容器** 中可以看到所有服务

### 群晖注意事项

- 确保端口 80、8088、5432 未被占用
- 数据卷默认在项目目录下，建议放在 `/volume1/docker/`
- 群晖重启后 Docker 容器会自动启动
- 如需外网访问，在群晖路由器设置中做端口转发，或使用群晖自带的 DDNS

---

## 部署到飞牛 NAS（fnOS）

### 1. 开启 SSH

飞牛 → 系统设置 → 高级设置 → SSH → 启用

### 2. SSH 登录

```bash
ssh fn@your-fnos-ip
sudo -i
```

### 3. 安装 Docker

飞牛 fnOS 自带 Docker 支持。如果未安装：

```bash
# 检查 Docker
docker --version

# 如果未安装
apt update && apt install -y docker.io docker-compose-plugin
systemctl enable docker && systemctl start docker
```

### 4. 部署

```bash
# 创建目录
mkdir -p /vol1/docker/blog
cd /vol1/docker/blog

# 克隆项目
git clone https://github.com/sexyfeifan/blog-new.git .
# 或者下载 zip
wget https://github.com/sexyfeifan/blog-new/archive/refs/heads/main.zip
unzip main.zip && mv blog-new-main/* . && rm -rf blog-new-main main.zip

# 配置
cp .env.example .env
nano .env

# 启动
docker compose up -d
```

### 5. 验证

```bash
# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f

# 测试访问
curl http://localhost
```

### 6. 飞牛注意事项

- 飞牛的数据卷路径通常是 `/vol1/` 或 `/vol2/`
- 如果端口 80 被占用，修改 `.env` 中的 `HTTP_PORT=8080`
- 飞牛重启后 Docker 容器会自动启动（已配置 `restart: unless-stopped`）

---

## 使用自己的 Docker Hub 镜像

如果你想自定义博客代码并使用自己的镜像：

```bash
# 1. 登录 Docker Hub
docker login

# 2. 构建并推送（使用项目自带脚本）
./build-and-push.sh

# 3. 在服务器上拉取最新镜像
docker compose pull
docker compose up -d
```

手动构建：
```bash
docker build -t sexyfeifan/blog-backend:latest ./backend
docker build -t sexyfeifan/blog-frontend:latest ./frontend
docker push sexyfeifan/blog-backend:latest
docker push sexyfeifan/blog-frontend:latest
```

---

## 常用命令

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f           # 所有服务
docker compose logs -f backend   # 后端
docker compose logs -f frontend  # 前端

# 重启
docker compose restart           # 全部
docker compose restart backend   # 单个

# 停止
docker compose down

# 更新
git pull
docker compose pull
docker compose up -d

# 重新构建
docker compose build --no-cache
docker compose up -d
```

## 数据备份

```bash
# 备份数据库
docker exec blog-postgres pg_dump -U bloguser blog > backup_$(date +%Y%m%d).sql

# 备份文件存储
docker run --rm -v blog-new_rustfs_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/rustfs_$(date +%Y%m%d).tar.gz /data

# 恢复数据库
cat backup_20260611.sql | docker exec -i blog-postgres psql -U bloguser blog
```

## 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 80 | Nginx | 博客首页 |
| 3000 | Next.js | 前端（内部） |
| 8088 | Rust API | 后端 API |
| 5432 | PostgreSQL | 数据库 |
| 6379 | Redis | 缓存 |
| 9000 | RustFS API | 文件存储 |
| 9001 | RustFS Console | 文件存储面板 |

## 故障排查

```bash
# 服务无法启动
docker compose logs backend | tail -20

# 数据库连接失败
docker compose logs postgres | tail -20

# 端口被占用
lsof -i :80
lsof -i :8088

# 重置所有数据
docker compose down -v
docker compose up -d
```

## 致谢

- [mdddj/blog-new](https://github.com/mdddj/blog-new) — 原始项目
- [animal-island-ui](https://github.com/guokaigdg/animal-island-ui) — 动森风格 UI 组件库
