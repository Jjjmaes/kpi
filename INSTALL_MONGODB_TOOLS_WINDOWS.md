# Windows 安装 MongoDB Database Tools 指南

## 问题说明

如果看到以下错误：
```
'mongodump' 不是内部或外部命令，也不是可运行的程序
```

说明系统未安装 MongoDB Database Tools 或未添加到 PATH 环境变量。

## 安装步骤

### 方法一：下载安装包（推荐）

1. **下载 MongoDB Database Tools**
   - 访问：https://www.mongodb.com/try/download/database-tools
   - 选择 Windows 版本（通常选择 ZIP 格式）
   - 下载后解压到任意目录，例如：`C:\mongodb-database-tools`

2. **添加到系统 PATH**
   
   **Windows 10/11:**
   - 按 `Win + X`，选择"系统"
   - 点击"高级系统设置"
   - 点击"环境变量"
   - 在"系统变量"中找到 `Path`，点击"编辑"
   - 点击"新建"，添加工具目录的 `bin` 文件夹路径，例如：
     ```
     C:\mongodb-database-tools\bin
     ```
   - 点击"确定"保存所有窗口

   **或者使用命令行（管理员权限）：**
   ```powershell
   # 替换为你的实际路径
   $toolsPath = "C:\mongodb-database-tools\bin"
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";$toolsPath", [EnvironmentVariableTarget]::Machine)
   ```

3. **验证安装**
   
   打开新的命令提示符或 PowerShell，运行：
   ```cmd
   mongodump --version
   mongorestore --version
   ```
   
   如果显示版本号，说明安装成功。

### 方法二：使用 Chocolatey（如果已安装）

```powershell
choco install mongodb-database-tools
```

### 方法三：使用 Scoop（如果已安装）

```powershell
scoop install mongodb-database-tools
```

## 重启应用

安装完成后，需要：
1. 关闭当前运行的 Node.js 应用
2. 重新打开命令提示符/PowerShell（让 PATH 生效）
3. 重新启动应用

## 验证

安装成功后，尝试在系统中创建备份，应该不再出现 `mongodump` 未找到的错误。

## 注意事项

- 确保 MongoDB 服务正在运行
- 确保 MongoDB 连接字符串正确（检查 `.env` 文件中的 `MONGODB_URI`）
- 如果使用远程 MongoDB，确保网络连接正常

## 故障排查

### 问题：添加 PATH 后仍然找不到命令

**解决方法：**
1. 完全关闭所有命令提示符和 PowerShell 窗口
2. 重新打开新的窗口
3. 运行 `mongodump --version` 验证

### 问题：权限不足

**解决方法：**
- 确保以管理员权限运行命令提示符
- 或者将工具安装到用户目录，只添加到用户 PATH

### 问题：MongoDB 连接失败

**解决方法：**
- 检查 MongoDB 服务是否运行：`net start MongoDB`（Windows 服务）
- 检查连接字符串格式是否正确
- 检查防火墙设置

