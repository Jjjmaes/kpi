# Nginx 配置指南 - 解决 413 Request Entity Too Large 错误

## 问题描述

当创建项目并上传附件时，如果遇到 `413 Request Entity Too Large` 错误，这通常是因为 Nginx 反向代理的请求体大小限制太小导致的。

## 解决方案

### 1. 修改 Nginx 配置

在 Nginx 配置文件中（通常是 `/etc/nginx/nginx.conf` 或 `/etc/nginx/sites-available/your-site`），添加或修改 `client_max_body_size` 指令：

```nginx
server {
    listen 80;
    server_name kpi.fanyiworld.com;
    
    # 增加请求体大小限制（支持 50MB 的请求体）
    # 注意：Base64 编码会使文件大小增加约 33%
    # 前端限制为 15MB，Base64 编码后约为 20MB，加上其他数据总大小约 25-30MB
    client_max_body_size 50m;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 增加超时时间，以支持大文件上传
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

### 2. 重新加载 Nginx 配置

修改配置后，需要重新加载 Nginx：

```bash
# 测试配置是否正确
sudo nginx -t

# 如果测试通过，重新加载配置
sudo systemctl reload nginx
# 或者
sudo service nginx reload
```

### 3. 验证配置

重新加载后，可以通过以下方式验证：

1. 尝试创建项目并上传附件（总大小不超过 15MB）
2. 检查 Nginx 错误日志：`sudo tail -f /var/log/nginx/error.log`
3. 如果仍有问题，检查 Nginx 访问日志：`sudo tail -f /var/log/nginx/access.log`

## 配置说明

### client_max_body_size

- **默认值**：通常是 1MB
- **推荐值**：50MB（与 Express 服务器的限制一致）
- **说明**：限制客户端请求体的最大大小

### 超时设置

为了支持大文件上传，建议增加以下超时设置：

- `proxy_connect_timeout`：代理连接超时（建议 300 秒）
- `proxy_send_timeout`：代理发送超时（建议 300 秒）
- `proxy_read_timeout`：代理读取超时（建议 300 秒）

## 文件大小限制说明

### 前端限制

- **原始文件大小**：15MB
- **Base64 编码后**：约 20MB（增加约 33%）
- **加上其他数据**：总请求体约 25-30MB

### 后端限制

- **Express body-parser**：50MB（已在 `server.js` 中配置）
- **Nginx client_max_body_size**：建议设置为 50MB

## 常见问题

### Q: 为什么前端限制是 15MB 而不是 20MB？

A: 因为 Base64 编码会使文件大小增加约 33%。15MB 的原始文件编码后约为 20MB，加上其他项目数据，总请求体大小约为 25-30MB，这样可以确保不会超过服务器限制。

### Q: 如果仍然遇到 413 错误怎么办？

1. 检查 Nginx 配置是否正确加载：`sudo nginx -t`
2. 检查是否有多个 `client_max_body_size` 指令（应该只有一个，在 `server` 或 `location` 块中）
3. 检查 Nginx 错误日志：`sudo tail -f /var/log/nginx/error.log`
4. 确认 Express 服务器的限制是否足够（`server.js` 中已设置为 50MB）

### Q: 可以设置更大的限制吗？

A: 可以，但需要注意：
- 更大的限制会占用更多服务器内存
- 上传大文件会占用更多带宽和时间
- 建议根据实际需求设置，不要设置过大

## 相关文件

- `server.js`：Express 服务器配置（请求体限制：50MB）
- `public/js/modules/project.js`：前端文件大小检查（限制：15MB）

---

**最后更新**：2025-01-16

