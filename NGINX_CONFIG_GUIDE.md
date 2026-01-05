# Nginx 配置指南 - 解决 413 Request Entity Too Large 错误

## 问题描述

当创建项目并上传附件时，如果遇到 `413 Request Entity Too Large` 错误，这通常是因为 Nginx 反向代理的请求体大小限制太小导致的。

### 实际案例

从错误日志可以看到：
- **请求体大小**：约 3.8MB（3853657 bytes）
- **错误信息**：`client intended to send too large body: 3853657 bytes`
- **原因**：Nginx 的 `client_max_body_size` 默认只有 1MB，无法处理 3.8MB 的请求

**说明**：2MB 的文件经过 Base64 编码后约为 2.67MB，加上项目其他数据（项目信息、报价明细等），总请求体大小约为 3.8MB。

## 解决方案

### 1. 查找 Nginx 配置文件

首先找到你的 Nginx 配置文件：

```bash
# 方法 1：查找包含 server_name kpi.fanyiworld.com 的配置文件
sudo grep -r "kpi.fanyiworld.com" /etc/nginx/

# 方法 2：查找所有配置文件
sudo find /etc/nginx -name "*.conf" -type f

# 方法 3：查看主配置文件
cat /etc/nginx/nginx.conf | grep -E "include|server_name"
```

**实际配置文件位置**（已确认）：
- ✅ `/etc/nginx/conf.d/fanyiworld.conf` - 包含 kpi.fanyiworld.com 的配置

### 查看当前配置

在修改之前，先查看当前的配置结构：

```bash
# 查看完整的配置文件
sudo cat /etc/nginx/conf.d/fanyiworld.conf

# 或者只查看 kpi.fanyiworld.com 相关的部分
sudo grep -A 20 "server_name kpi.fanyiworld.com" /etc/nginx/conf.d/fanyiworld.conf
```

### 2. 修改 Nginx 配置

配置文件位置：`/etc/nginx/conf.d/fanyiworld.conf`

#### 方法 1：手动编辑（推荐）

```bash
# 使用 nano 编辑器打开配置文件
sudo nano /etc/nginx/conf.d/fanyiworld.conf
```

找到 `server_name kpi.fanyiworld.com;` 所在的 `server` 块，在 `server_name` 行之后添加 `client_max_body_size 50m;`：

```nginx
server {
    listen 80;
    server_name kpi.fanyiworld.com;
    
    # ⚠️ 添加这一行：增加请求体大小限制
    client_max_body_size 50m;
    
    location / {
        proxy_pass http://localhost:3000;
        # ... 其他配置 ...
        
        # 建议也增加超时时间（如果还没有的话）
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

**保存并退出**：
- 按 `Ctrl + X`
- 按 `Y` 确认保存
- 按 `Enter` 确认文件名

#### 方法 2：使用 sed 命令快速添加

如果配置文件结构简单，可以使用以下命令：

```bash
# 在 server_name kpi.fanyiworld.com; 之后添加 client_max_body_size 50m;
sudo sed -i '/server_name kpi.fanyiworld.com;/a\    client_max_body_size 50m;' /etc/nginx/conf.d/fanyiworld.conf
```

**注意**：
- 如果使用 HTTPS（443 端口），也需要在相应的 `server` 块中添加 `client_max_body_size 50m;`
- 如果配置文件中已经有 `client_max_body_size`，需要先删除旧的，或者修改为 `50m`

### 3. 验证并重新加载 Nginx 配置

修改配置后，需要验证并重新加载 Nginx：

```bash
# 1. 测试配置是否正确（非常重要！）
sudo nginx -t

# 如果测试失败，检查错误信息并修复
# 如果测试通过，会显示：
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# 2. 重新加载配置（不中断服务）
sudo systemctl reload nginx
# 或者
sudo service nginx reload

# 3. 验证配置已生效
sudo nginx -T | grep client_max_body_size
# 应该显示：client_max_body_size 50m;
```

### 4. 验证配置是否生效

重新加载后，可以通过以下方式验证：

1. **检查配置是否生效**：
   ```bash
   sudo nginx -T | grep client_max_body_size
   ```
   
   **注意**：如果看到多个 `client_max_body_size` 设置，这是正常的：
   - 可能在不同的 `server` 块中（HTTP 和 HTTPS）
   - 可能在 `location` 块中
   - Nginx 会使用最具体的设置（通常是 `location` 块中的会覆盖 `server` 块中的）
   - 只要有一个设置为 50m 或更大，就应该能处理 3.8MB 的请求
   - 如果看到 `50m` 和 `20m` 两个设置，`50m` 应该会生效（如果它们在同一个作用域，后定义的会覆盖先定义的）

2. **检查实际生效的配置**（查看完整的 server 块）：
   ```bash
   sudo nginx -T | grep -A 20 "server_name kpi.fanyiworld.com"
   ```
   确认 `client_max_body_size` 在正确的 `server` 或 `location` 块中。

3. **尝试创建项目并上传附件**（总大小不超过 15MB）

4. **监控错误日志**（在另一个终端）：
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```
   如果配置正确，应该不会再看到 413 错误。

5. **如果仍有问题**，检查访问日志：
   ```bash
   sudo tail -f /var/log/nginx/access.log
   ```
   查看请求是否成功（状态码应该是 200 而不是 413）。

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

