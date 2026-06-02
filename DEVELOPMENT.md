# 开发说明

## 开发环境

需要安装：

- Node.js
- Rust
- Tauri 2 所需的系统依赖

Windows 下通常还需要 WebView2 Runtime。Tauri 的系统依赖可参考 Tauri 官方文档。

## 安装依赖

```bash
npm install
```

## 本地运行

启动完整桌面应用：

```bash
npm run dev
```

只启动 Web 前端：

```bash
npm run dev:web
```

Vite 端口可通过 `.env` 配置。可以复制 `.env.example`：

```bash
cp .env.example .env
```

支持的环境变量：

```text
CELEPKG_DEV_HOST=127.0.0.1
CELEPKG_DEV_PORT=5173
CELEPKG_PREVIEW_HOST=127.0.0.1
CELEPKG_PREVIEW_PORT=4173
CELEPKG_API_PROXY_TARGET=http://127.0.0.1:8787
```

`CELEPKG_API_PROXY_TARGET` 仅用于浏览器前端开发时的可选本地代理。

## 构建

构建 Web 产物：

```bash
npm run build:web
```

构建 Tauri 桌面应用安装包：

```bash
npm run build
```

构建产物由 Tauri 输出到 `src-tauri/target/release/bundle/` 下。

## 代码检查

```bash
npm run lint
npm run format:check
npm run build:web
```

Rust 测试：

```bash
cd src-tauri
cargo fmt -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

自动格式化：

```bash
npm run format
cd src-tauri
cargo fmt
```

## 项目结构

```text
src/
  components/       React 组件
  hooks/            前端状态和业务 Hook
  utils/            前端工具函数
  api.ts            Tauri 命令封装
src-tauri/
  src/commands.rs   Tauri 命令入口
  src/services/     扫描、Profile、备份等后端服务
  src/parsers/      Celeste / Everest / 存档解析
  src/storage.rs    应用配置与缓存路径
```
