# Microgestures 学术文献管理系统 - 完整部署教程

> 🎓 专业的学术论文管理工具，支持PDF存储、在线预览、智能分类和云端同步

## 📋 目录

- [系统概述](#系统概述)
- [功能特性](#功能特性)
- [部署准备](#部署准备)
- [第一部分：GitHub 仓库设置](#第一部分github-仓库设置)
- [第二部分：Netlify 部署](#第二部分netlify-部署)
- [第三部分：GitHub 云存储配置](#第三部分github-云存储配置)
- [第四部分：功能测试](#第四部分功能测试)
- [第五部分：高级配置](#第五部分高级配置)
- [常见问题解答](#常见问题解答)
- [维护和更新](#维护和更新)

---

## 📊 系统概述

Microgestures 是一个现代化的学术文献管理系统，具有以下核心特性：

- **📚 智能论文管理**：支持 PDF、DOC、JSON、CSV 格式的批量上传
- **🔍 高级搜索筛选**：多维度检索和筛选功能
- **📄 内置 PDF 阅读器**：无需下载即可在线查看 PDF 文件
- **☁️ 云端存储同步**：基于 GitHub 的永久存储解决方案
- **🌐 跨设备访问**：响应式设计，支持各种设备
- **🔄 实时数据同步**：自动同步到 GitHub，支持团队协作

---

## ✨ 功能特性

### 📁 文件管理
- **批量上传**：一次性上传多个文件
- **智能分类**：6大研究领域自动分类
- **PDF 预览**：自动生成缩略图
- **在线阅读**：内置 PDF.js 阅读器

### 🔍 搜索和筛选
- **全文搜索**：标题、作者、摘要、关键词检索
- **高级筛选**：年份范围、研究方法、期刊会议等
- **实时过滤**：即时响应的搜索结果

### ☁️ 云端功能
- **GitHub 存储**：PDF 文件永久存储
- **数据同步**：论文元数据云端同步
- **跨设备访问**：任何设备都能访问您的文献库
- **团队分享**：通过链接分享您的研究数据库

### 🛠️ 管理功能
- **在线编辑**：直接编辑论文信息
- **删除管理**：单个删除和批量清理
- **数据导入导出**：支持多种格式
- **版本控制**：基于 Git 的自动版本管理

---

## 🛠️ 部署准备

### 📋 所需账户
1. **GitHub 账户**（免费）- [注册地址](https://github.com)
2. **Netlify 账户**（免费）- [注册地址](https://netlify.com)

### 💾 所需文件
确保您有完整的项目文件：
```
microgestures/
├── index.html              # 主页面
├── app.js                   # 主要应用逻辑
├── github-storage.js        # GitHub 存储功能
├── indexeddb-storage.js     # 本地存储功能
├── style.css                # 样式文件
├── manifest.json            # PWA 配置
├── _redirects               # Netlify 路由配置
├── README.md                # 项目说明
└── 使用说明.md              # 详细使用说明
```

### ⏱️ 预计时间
- **基础部署**：15-20 分钟
- **完整配置**：30-40 分钟

---

## 第一部分：GitHub 仓库设置

### 步骤 1.1：创建 GitHub 仓库

1. **登录 GitHub**
   - 访问 [GitHub.com](https://github.com)
   - 使用您的账户登录

2. **创建新仓库**
   ```
   点击右上角 "+" 图标 → "New repository"
   ```

3. **配置仓库信息**
   ```
   Repository name: microgestures（或您喜欢的名称）
   Description: Academic paper management system
   Visibility: ✅ Public（重要：免费用户需要公开仓库才能使用 Netlify）
   Initialize this repository with:
   ❌ 不要勾选 "Add a README file"
   ❌ 不要勾选 "Add .gitignore"
   ❌ 不要勾选 "Choose a license"
   ```

4. **创建仓库**
   ```
   点击绿色的 "Create repository" 按钮
   ```

### 步骤 1.2：上传项目文件

**方法 A：通过 GitHub 网页界面上传（推荐新手）**

1. **在新创建的仓库页面，点击 "uploading an existing file"**

2. **批量上传文件**
   - 将所有项目文件拖拽到上传区域
   - 或点击 "choose your files" 选择文件

3. **提交文件**
   ```
   Commit message: Initial commit: Microgestures literature management system
   点击 "Commit changes"
   ```

**方法 B：通过 Git 命令行上传（推荐有经验用户）**

```bash
# 在项目文件夹中执行
git init
git add .
git commit -m "Initial commit: Microgestures literature management system"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/microgestures.git
git push -u origin main
```

### 步骤 1.3：验证上传成功

确认仓库中包含所有必要文件：
- ✅ index.html
- ✅ app.js
- ✅ github-storage.js
- ✅ indexeddb-storage.js
- ✅ style.css
- ✅ manifest.json
- ✅ _redirects

---

## 第二部分：Netlify 部署

### 步骤 2.1：连接 Netlify 与 GitHub

1. **访问 Netlify**
   - 打开 [Netlify.com](https://netlify.com)
   - 点击右上角 "Sign up" 或 "Log in"

2. **选择 GitHub 登录**
   ```
   点击 "Sign up with GitHub" 或 "Continue with GitHub"
   ```

3. **授权 Netlify**
   - GitHub 会询问是否授权 Netlify 访问您的仓库
   - 点击 "Authorize Netlify"

### 步骤 2.2：部署网站

1. **创建新站点**
   ```
   在 Netlify 控制台，点击 "New site from Git"
   ```

2. **选择 Git 提供商**
   ```
   点击 "GitHub"
   ```

3. **选择仓库**
   - 在仓库列表中找到 "microgestures"（或您的仓库名）
   - 点击选择该仓库

4. **配置构建设置**
   ```
   Branch to deploy: main
   Build command: （留空）
   Publish directory: （留空）
   ```
   > 💡 由于这是静态网站，不需要构建过程

5. **开始部署**
   ```
   点击 "Deploy site" 按钮
   ```

### 步骤 2.3：等待部署完成

1. **监控部署进度**
   - Netlify 会显示部署状态
   - 通常需要 2-5 分钟完成

2. **获取网站地址**
   - 部署完成后，您会看到类似这样的地址：
   ```
   https://amazing-tesla-123456.netlify.app
   ```

3. **测试基础功能**
   - 点击生成的链接
   - 确认网站能正常打开
   - 确认界面显示正确

### 步骤 2.4：自定义域名（可选）

1. **设置自定义域名**
   ```
   在 Netlify 控制台 → Site settings → Domain management
   ```

2. **添加自定义域名**
   ```
   点击 "Add custom domain"
   输入您的域名，如：microgestures.yourname.com
   ```

3. **配置 DNS**
   - 按照 Netlify 提供的说明配置您的 DNS 记录
   - 等待 DNS 传播（通常 24-48 小时）

---

## 第三部分：GitHub 云存储配置

### 步骤 3.1：创建 GitHub Personal Access Token

1. **访问 GitHub 设置**
   ```
   登录 GitHub → 点击右上角头像 → Settings
   ```

2. **进入开发者设置**
   ```
   左侧菜单 → Developer settings → Personal access tokens → Tokens (classic)
   ```

3. **生成新 Token**
   ```
   点击 "Generate new token" → "Generate new token (classic)"
   ```

4. **配置 Token**
   ```
   Note: microgestures-storage
   Expiration: No expiration（或选择较长期限）
   
   Select scopes:
   ✅ repo (Full control of private repositories)
      ✅ repo:status
      ✅ repo_deployment
      ✅ public_repo
      ✅ repo:invite
      ✅ security_events
   ```

5. **生成并复制 Token**
   ```
   点击 "Generate token"
   ⚠️ 立即复制 Token！它只显示一次
   ```

### 步骤 3.2：在网站中配置 GitHub 存储

1. **访问您的网站**
   - 打开您的 Netlify 网站地址

2. **打开 GitHub 设置**
   ```
   点击右上角 "⚙️ GitHub Storage" 按钮
   ```

3. **输入 GitHub Token**
   ```
   在 "GitHub Personal Access Token" 输入框中粘贴您的 Token
   ```

4. **测试连接**
   ```
   点击 "Test Connection" 按钮
   等待显示 "✅ Connection successful!"
   ```

5. **保存设置**
   ```
   点击 "Save Settings" 按钮
   ```

### 步骤 3.3：验证云存储功能

1. **检查状态**
   - Status 应该显示 "Connected"
   - Repository 应该显示您的仓库名

2. **测试同步**
   ```
   点击 "Sync Database" 按钮
   等待显示同步成功消息
   ```

---

## 第四部分：功能测试

### 步骤 4.1：测试文件上传

1. **上传 PDF 文件**
   ```
   点击 "Upload Paper" → 选择 "File Upload" 标签
   拖拽或选择一个 PDF 文件
   点击 "Start Upload"
   ```

2. **验证上传结果**
   - 确认文件出现在主页面
   - 确认有缩略图显示
   - 确认显示了 "PDF uploaded to GitHub successfully!" 消息

### 步骤 4.2：测试 PDF 查看

1. **打开论文详情**
   ```
   点击任意论文卡片
   ```

2. **测试 PDF 阅读器**
   ```
   点击 "📄 View PDF Document" 按钮
   确认 PDF 在模态窗口中正确显示（而不是下载）
   ```

### 步骤 4.3：测试搜索和筛选

1. **测试搜索功能**
   ```
   在顶部搜索框输入关键词
   确认搜索结果正确显示
   ```

2. **测试筛选功能**
   ```
   使用右侧筛选栏的各种选项
   确认筛选结果准确
   ```

### 步骤 4.4：测试编辑和删除

1. **测试编辑功能**
   ```
   打开论文详情 → 点击 "✏️ Edit"
   修改信息 → 点击 "💾 Save"
   确认修改已保存
   ```

2. **测试删除功能**
   ```
   打开论文详情 → 点击 "🗑️ Delete"
   确认删除成功
   ```

### 步骤 4.5：测试数据共享

1. **分享链接测试**
   - 复制您的网站链接
   - 在无痕浏览器窗口中打开
   - 确认能看到您上传的论文数据

2. **验证同步功能**
   ```
   在 GitHub 仓库中检查是否有：
   - pdfs/ 文件夹（包含上传的 PDF）
   - papers-database.json 文件（包含论文元数据）
   ```

---

## 第五部分：高级配置

### 步骤 5.1：配置自动部署

1. **设置 Webhook**
   - Netlify 已自动配置
   - 每次推送到 GitHub 都会自动重新部署

2. **自定义构建设置**
   ```
   Netlify 控制台 → Site settings → Build & deploy
   可以配置构建通知、环境变量等
   ```

### 步骤 5.2：性能优化

1. **启用缓存**
   ```
   Netlify 自动启用 CDN 缓存
   ```

2. **压缩优化**
   ```
   Netlify 自动启用 Gzip 压缩
   ```

### 步骤 5.3：安全设置

1. **HTTPS 配置**
   ```
   Netlify 自动配置 SSL 证书
   强制 HTTPS 重定向
   ```

2. **访问控制**（可选）
   ```
   Netlify 控制台 → Site settings → Access control
   可以设置密码保护或其他访问限制
   ```

### 步骤 5.4：监控和分析

1. **启用分析**
   ```
   Netlify 控制台 → Site settings → Analytics
   可以查看访问统计
   ```

2. **错误监控**
   ```
   通过浏览器开发者工具监控错误
   检查 Netlify 部署日志
   ```

---

## ❓ 常见问题解答

### Q1: 部署后网站显示 404 错误
**解决方案：**
```
1. 检查 _redirects 文件是否正确上传
2. 确认 index.html 文件在根目录
3. 等待 DNS 传播完成（如果使用自定义域名）
```

### Q2: PDF 文件点击后自动下载而不是查看
**解决方案：**
```
1. 确认已配置 GitHub 存储
2. 重新上传 PDF 文件以获取新的 CDN 链接
3. 检查浏览器是否阻止弹窗
```

### Q3: GitHub Token 失效
**解决方案：**
```
1. 重新生成 GitHub Token
2. 确认 Token 权限包含 repo 完整权限
3. 在网站中重新配置 Token
```

### Q4: 上传文件失败
**可能原因和解决方案：**
```
1. 文件过大（>100MB）- 压缩文件或分批上传
2. 网络连接问题 - 检查网络后重试
3. GitHub 存储空间不足 - 清理旧文件或联系 GitHub
4. Token 权限不足 - 重新生成具有完整 repo 权限的 Token
```

### Q5: 别人访问链接看到空白页面
**解决方案：**
```
1. 确认已配置 GitHub 存储
2. 点击 "Sync Database" 同步数据
3. 等待几分钟让 CDN 缓存更新
```

### Q6: 网站加载缓慢
**优化建议：**
```
1. 压缩大型 PDF 文件
2. 清理不需要的论文数据
3. 使用现代浏览器
4. 检查网络连接质量
```

---

## 🔧 维护和更新

### 定期维护任务

**每周：**
- [ ] 检查网站访问正常
- [ ] 同步最新论文数据
- [ ] 清理不需要的文件

**每月：**
- [ ] 更新 GitHub Token（如有需要）
- [ ] 检查存储空间使用情况
- [ ] 备份重要数据

**每季度：**
- [ ] 检查是否有系统更新
- [ ] 优化论文分类和标签
- [ ] 评估性能和用户体验

### 版本更新

1. **获取更新**
   ```
   从原始仓库拉取最新代码
   git pull origin main
   ```

2. **测试更新**
   ```
   在本地环境测试新功能
   确认无冲突后推送到您的仓库
   ```

3. **自动部署**
   ```
   Netlify 会自动检测更新并重新部署
   ```

### 数据备份策略

1. **GitHub 自动备份**
   - PDF 文件存储在 GitHub 仓库
   - 论文元数据存储在 papers-database.json

2. **手动备份**
   ```
   定期下载 papers-database.json 文件
   导出重要 PDF 文件到本地
   ```

3. **恢复策略**
   ```
   如果数据丢失，可以从 GitHub 仓库恢复：
   1. 重新部署网站
   2. 重新配置 GitHub 存储
   3. 系统会自动加载共享数据库
   ```

---

## 🎉 部署完成

恭喜！您已经成功部署了 Microgestures 学术文献管理系统。

### 🎯 现在您可以：

- ✅ 上传和管理 PDF 论文
- ✅ 使用高级搜索和筛选功能
- ✅ 在线预览 PDF 文档
- ✅ 与团队成员分享文献数据库
- ✅ 跨设备访问您的研究资料
- ✅ 享受云端自动同步和备份

### 📚 进一步学习：

- 阅读 [使用说明.md](./使用说明.md) 了解详细功能
- 访问 [GitHub 仓库](https://github.com/您的用户名/microgestures) 查看源码
- 关注项目更新获取新功能

### 💡 获得帮助：

如果遇到问题，请：
1. 检查本文档的常见问题解答部分
2. 查看 Netlify 和 GitHub 的官方文档
3. 在项目 GitHub 仓库中创建 Issue

**祝您使用愉快！学术研究更高效！** 🚀

---

*本部署教程最后更新时间：2025年1月*
*系统版本：Microgestures v1.0*