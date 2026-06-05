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

启动带假数据的 UI 预览：

```bash
npm run dev:mock
```

Mock 预览入口是 `/mock`，也可以在任意本地地址后加 `?mock=1`。它不会调用 Tauri 后端，Profile、备份、收藏、始终启用、启动和还原等操作都只会修改浏览器内存里的假数据，适合快速截图反馈 UI 问题。

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

本地提交前至少执行：

```bash
npm run format:check
npm run lint
npm run test
npm run build:web
```

Rust 检查使用和 CI 一致的命令：

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

自动格式化：

```bash
npm run format
cd src-tauri
cargo fmt
```

## 发布流程

发布前必须先在本地跑完 CI 同款检查：

```bash
npm run format:check
npm run lint
npm run test
npm run build:web
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

确认通过后再更新版本号和 `CHANGELOG.md`，提交发布 commit，并创建 tag：

```bash
git commit -m "发布 vX.Y.Z"
git tag vX.Y.Z
```

推送顺序：

```bash
git push origin main
gh run list --limit 5
git push origin vX.Y.Z
gh run list --limit 5
```

推送 `main` 后先确认 CI 通过，再推送 tag 触发 Release。Release 推送后也要检查 Actions 状态：

```bash
gh run view <run-id> --json status,conclusion,jobs
```

如果 tag 已经推送但发布提交需要修正，应在修正提交完成并通过本地 CI 同款检查后，将 tag 移到修正后的提交并强制推送该 tag：

```bash
git tag -f vX.Y.Z
git push origin vX.Y.Z --force
```

只强制更新 tag，不强推 `main`。如 GitHub Release 已经生成，需要确认 release 产物来自更新后的 tag run。

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
