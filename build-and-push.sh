#!/bin/bash
# ===========================================
# 构建并推送 Docker 镜像到 Docker Hub
# 用法: ./build-and-push.sh [tag]
# ===========================================

set -e

TAG=${1:-"latest"}
DOCKER_USER="sexyfeifan"
BACKEND_IMAGE="$DOCKER_USER/blog-backend:$TAG"
FRONTEND_IMAGE="$DOCKER_USER/blog-frontend:$TAG"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   构建并推送 Docker 镜像${NC}"
echo -e "${GREEN}   用户: $DOCKER_USER${NC}"
echo -e "${GREEN}   标签: $TAG${NC}"
echo -e "${GREEN}=========================================${NC}"

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker 未运行，请先启动 Docker${NC}"
    exit 1
fi

# 检查是否登录 Docker Hub
if ! docker info 2>&1 | grep -q "Username"; then
    echo -e "${YELLOW}未登录 Docker Hub，正在登录...${NC}"
    docker login
fi

# 构建后端镜像
echo -e "${GREEN}[1/4] 构建后端镜像...${NC}"
docker build -t "$BACKEND_IMAGE" ./backend
echo -e "${GREEN}✅ 后端镜像构建完成${NC}"

# 构建前端镜像
echo -e "${GREEN}[2/4] 构建前端镜像...${NC}"
docker build -t "$FRONTEND_IMAGE" ./frontend
echo -e "${GREEN}✅ 前端镜像构建完成${NC}"

# 推送后端镜像
echo -e "${GREEN}[3/4] 推送后端镜像到 Docker Hub...${NC}"
docker push "$BACKEND_IMAGE"
echo -e "${GREEN}✅ 后端镜像推送完成${NC}"

# 推送前端镜像
echo -e "${GREEN}[4/4] 推送前端镜像到 Docker Hub...${NC}"
docker push "$FRONTEND_IMAGE"
echo -e "${GREEN}✅ 前端镜像推送完成${NC}"

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   全部完成！${NC}"
echo -e "${GREEN}=========================================${NC}"
echo -e ""
echo -e "镜像地址："
echo -e "  后端: ${YELLOW}$BACKEND_IMAGE${NC}"
echo -e "  前端: ${YELLOW}$FRONTEND_IMAGE${NC}"
echo -e ""
echo -e "在服务器上部署："
echo -e "  ${YELLOW}docker compose pull && docker compose up -d${NC}"
