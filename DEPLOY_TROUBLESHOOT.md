# 部署排查报告

## 实际部署过程中遇到的问题及解决方案

### 问题 1: nginx.conf 被创建为目录

**现象：**
```
mount src=/opt/.../nginx.conf, dst=/etc/nginx/nginx.conf: not a directory
```

**原因：** 飞牛 NAS 的编排功能在创建项目时，如果 `nginx.conf` 文件不存在，会将其创建为目录而非文件。

**解决：** 在 GitHub 仓库中预先包含 `nginx.conf` 文件。

---

### 问题 2: 数据库密码不匹配

**现象：**
```
password authentication failed for user "bloguser"
```

**原因：** 首次部署时 `.env` 为空或未配置，PostgreSQL 使用默认密码创建了数据卷。后续修改 `.env` 后，新密码与已有数据卷中的密码不匹配。

**解决：** 删除旧数据卷重新创建：
```bash
docker compose down
docker volume rm blog_postgres_data blog_redis_data blog_rustfs_data blog_rustfs_logs
docker compose up -d
```

---

### 问题 3: 端口 80/8080 被占用

**现象：**
```
Error: Os { code: 98, kind: AddrInUse, message: "Address already in use" }
```

**原因：** 80 和 8080 是常见 Web 服务端口，NAS/服务器上经常被其他服务占用。

**解决：** 默认端口改为 3900/3901：
```bash
HTTP_PORT=3900
BACKEND_PORT=3901
```

---

### 问题 4: 管理员创建方式不明确

**现象：** `create-admin` 命令会启动一个新的后端实例，与运行中的容器端口冲突。

**原因：** `create_admin.rs` 编译为独立二进制，但 Dockerfile 中它被合并到主二进制中。执行时会尝试绑定端口。

**解决：** 使用 API 端点创建管理员：
```bash
# 1. 如果已有旧用户，先删除
docker exec blog-postgres psql -U bloguser -d blog -c "DELETE FROM users WHERE username = 'admin';"

# 2. 通过 API 创建
curl -X POST http://localhost:3901/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","nickname":"Admin"}'
```

---

### 问题 5: MCP token 未初始化

**现象：**
```json
{"code":401,"message":"MCP token not initialized"}
```

**原因：** 部分 API 端点需要 MCP token 认证，但首次部署时未初始化。

**解决：** MCP token 在数据库 `site_config` 表中配置。首次部署后通过管理面板初始化，或直接使用 `/api/v1/auth/setup` 端点（不需要 MCP token）。

---

## 部署检查清单

- [ ] `.env` 文件已配置（POSTGRES_PASSWORD、JWT_SECRET、RUSTFS_SECRET_KEY）
- [ ] `nginx.conf` 是文件而非目录
- [ ] 端口 3900/3901 未被占用
- [ ] 数据卷是全新的（首次部署）或密码匹配（更新部署）
- [ ] 管理员已通过 `/api/v1/auth/setup` 创建
- [ ] 前端 `NEXT_PUBLIC_API_URL` 指向正确的后端地址
