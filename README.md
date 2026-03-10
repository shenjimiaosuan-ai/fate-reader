# 神机妙算 - AI命理推理服务

基于中国传统命理学的AI推理服务，仿造 shenjimiaosuan.cc

## 功能特点

- 八字命理分析
- 纳音五行计算
- AI智能推演（基于通义千问）
- 趋吉避凶建议

## 快速开始

### 1. 环境要求

- Node.js 18+
- npm 或 yarn

### 2. 获取API Key（免费）

1. 访问 [阿里云百炼平台](https://bailian.console.aliyun.com/)
2. 注册/登录账号
3. 创建API Key（新人有免费额度）
4. 复制API Key

### 3. 安装依赖

```bash
cd D:\小秘自用工具库\神机妙算
npm install
```

### 4. 配置API Key

设置环境变量：

```bash
# Windows PowerShell
$env:DASHSCOPE_API_KEY="你的API密钥"

# Windows CMD
set DASHSCOPE_API_KEY=你的API密钥
```

或直接修改 `server/index.js` 中的 `DASHSCOPE_API_KEY` 变量

### 5. 启动服务

```bash
# 启动后端（终端1）
npm run server

# 启动前端（终端2）
npm run dev
```

访问 http://localhost:3000

## 项目结构

```
神机妙算/
├── server/
│   └── index.js       # 后端服务（AI推理+八字计算）
├── src/
│   ├── main.jsx        # React入口
│   ├── App.jsx         # 主应用组件
│   └── index.css       # 样式文件
├── index.html          # HTML模板
├── vite.config.js      # Vite配置
└── package.json        # 项目配置
```

## 使用方法

1. 输入出生时间（格式：YYYY-MM-DD HH:MM）
2. 选择性别
3. 可选：输入想问的问题
4. 点击"开始推演"

## 注意事项

- 初次使用通义千问API有免费额度
- 若API失效或额度用完，请更新API Key
- 本地运行无需备案域名

## 技术栈

- 前端：React 19 + Vite + Tailwind CSS
- 后端：Express.js
- AI：阿里云通义千问（Qwen Turbo）
- 命理：lunar-javascript

---
🔮 科学推演 · 命理分析
