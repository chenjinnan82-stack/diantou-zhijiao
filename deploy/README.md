# 通用部署

安装 Node.js 22.9+，将源码放到自己的应用目录，运行 `npm ci --omit=dev --ignore-scripts`。使用仅服务账号可读的环境文件，配置两个密钥、`HOST=127.0.0.1`、`PORT=18426` 和自己的 HTTPS `PUBLIC_ORIGIN`。通过进程管理器运行 `node --env-file=.env server.mjs`，设置 `NODE_ENV=production` 和失败自动重启。

Nginx HTTPS 站点中的示例：

```nginx
location /lab/play/guess-my-order/ {
    proxy_pass http://127.0.0.1:18426;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

保留服务返回的定位权限与安全响应头。定位和分享需要 HTTPS（本机回环除外）。不要将环境文件放入静态目录。启用 gzip，访问 `/lab/play/guess-my-order/api/health` 验证服务。新部署先用独立目录检查，再切换进程目录；保留旧目录和配置用于回滚，不将环境文件打包。

腾讯 IP 白名单填写服务实际出口 IP，三个地图接口均需分配额度。无需数据库。缓存有容量和五分钟时限，上游并发最多两个；上线后检查错误率、内存和上游配额，避免对真实账号压测。
