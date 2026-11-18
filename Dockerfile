# ===== harness-snake — Web 静态容器（agent 家族 web 段 5308；容器内 :80，host 双层）=====
# 多阶段：node 构建 Vite 产物 → nginx:alpine 静态服务。
# 纯前端应用：零后端、零 secret（成绩册/最近一局录像全在浏览器 localStorage），
# 无 /api/ 反代、无 env-file——家族 deploy 脚本的 web-only 变体（harness-2048 同款）。
FROM node:24-alpine AS builder
WORKDIR /app

# 硬约束：npm 依赖一律走 npmmirror（suite root CLAUDE.md §2）
RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
