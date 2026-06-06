# CelePkg

CelePkg 是一个面向 Celeste 的桌面端本地 Mod / 地图管理器。它使用 Tauri 2 + React 构建，用来扫描 Celeste 官方地图与 `Mods` 目录，管理地图和其他 Mod 的启用状态，编辑 Profile，查看存档统计，并在修改受管启用状态文件前自动备份。

## 功能

- 扫描 Celeste `Mods` 目录，识别地图包、其他 Mod、Helper 测试图和依赖关系。
- 识别 Celeste 官方地图，并从游戏自带汉化中读取章节名称。
- 读取地图存档统计，展示完成状态、死亡数、用时、草莓、心和磁带等信息。
- 支持多存档统计，可在显示设置中选择参与统计的存档。
- 本地内容和 Mod 获取中心支持按名称、版本、文件名、相对路径、作者、描述、SID 和依赖等字段搜索，并高亮匹配片段。
- 草莓分母可切换：
  - 默认使用游戏概览分母。
  - 可切换为包含金莓、月莓、银莓、彩虹莓等特殊莓的全部草莓数。
- 管理地图 Profile 和其他 Mod Profile，编辑会自动保存到当前 Profile。
- 支持新建空 Profile、复制任意 Profile，也支持从另一个同类 Profile 覆盖当前 Profile；覆盖时可选择只覆盖启用情况或覆盖全部内容。
- Profile 启动参数支持普通参数、引号包裹路径、转义字符和空参数。
- 顶部支持“应用并启动”和“直接启动”：
  - 应用并启动会先应用当前地图 / Mod Profile，再启动游戏。
  - 直接启动不会改写 Profile 或 `blacklist.txt`。
- 支持删除 Profile，并可为新建 Profile 指定名称。
- 支持收藏和始终启用条目：
  - 收藏状态写入 `Mods/favorites.txt`。
  - Profile 应用会写入 `Mods/blacklist.txt`。
  - 始终启用条目可以在 Profile 中记录期望启用状态，但应用 Profile 时不会写入 blacklist，因此会保持实际启用，并会一起启用它声明的依赖。
- 支持受管文件备份与还原：
  - 手动备份。
  - 默认开启“修改前自动备份”。
  - 还原时只还原 CelePkg 管理的启用状态文件。
  - 可打开备份根目录或单个备份快照目录。
- 左侧“本地内容”统一承载地图和其他 Mod，列表内可在“地图 / 其他 Mod”之间切换；筛选区会随当前视图显示“地图筛选”“Mod 筛选”或“小图筛选”。
- Mod 获取中心支持目录搜索、来源筛选、类型筛选、安装状态识别、安装前依赖树预览和下载任务管理。
- 删除、覆盖、安装、更新和依赖处理等高风险操作统一使用应用内确认弹窗，确认前会展示目标、版本、数量或风险说明。
- 支持普通刷新和“刷新缓存并重新扫描地图”，用于地图文件或缓存口径变化后的强制重扫。

## 使用说明

面向玩家的机制说明和典型用法示例见 [USER_GUIDE.md](USER_GUIDE.md)。

## 备份说明

备份只覆盖 CelePkg 会修改的受管文件：

- `Mods/blacklist.txt`
- `Mods/favorites.txt`

备份目录位于当前 Celeste 目录下：

```text
<Celeste>/celepkg/backups/
```

每次备份会创建一个独立快照目录，包含：

- `manifest.json`
- `game/Mods/blacklist.txt`
- `game/Mods/favorites.txt`

`manifest.json` 会记录备份时扫描到的本地 Mod 清单，包括名称、文件名、相对路径、版本、启用状态和是否为 zip，用于查看当时环境。备份不会复制 Mod zip 或文件夹本体，因此不能用来恢复被删除或覆盖的 Mod 文件。

如果备份时目标文件不存在，`manifest.json` 会记录该文件不存在；还原启用状态时不会凭空创建空文件，若目标文件后来被创建则会删除它以恢复备份时状态。

CelePkg 自身配置 `state.json` 不会被备份或还原。

## 数据写入位置

CelePkg 可能修改的游戏目录文件：

- `<Celeste>/Mods/blacklist.txt`
- `<Celeste>/Mods/favorites.txt`
- `<Celeste>/celepkg/backups/`

应用配置和扫描缓存位于系统配置目录下的 `celepkg` 文件夹。扫描缓存可重新生成，不属于备份范围。

打开本地内容位置时，CelePkg 只允许打开当前 Celeste 目录下的 `Mods` 或 `Content` 内路径；打开备份位置时，只允许打开当前 Celeste 备份根目录下带 `manifest.json` 的快照目录。

写入游戏目录或启动游戏前，CelePkg 会校验当前路径必须是绝对路径、目录存在，并且看起来像 Celeste 安装目录。满足以下任一条件即可通过校验：

- 包含 `Mods` 目录。
- 包含 `Content` 目录。
- 包含 `Celeste.exe`、`Celeste` 或 `Celeste.bin.x86_64`。

这可以避免在路径为空、相对路径或普通文件夹时误创建 `Mods`、`blacklist.txt` 或备份目录。

## 注意事项

- 使用前请确认 Celeste 路径指向有效的游戏目录，普通文件夹不会通过校验。
- 官方地图只用于查看统计，不会被 CelePkg 禁用。
- CelePkg 只面向桌面窗口使用，不提供手机或窄屏布局适配。
- 应用 Profile 会重写 CelePkg 管理范围内的 blacklist 条目，但会保留非管理范围内容。
- Profile 页面可以从当前游戏或另一个同类 Profile 覆盖当前 Profile。从当前游戏覆盖时只覆盖非始终启用条目的启用情况，并保留始终启用条目的 Profile 选择；从 Profile 覆盖时可选择只覆盖启用情况或覆盖全部内容。Favorite / 始终启用标记不会被覆盖。
- 修改前自动备份默认开启，建议保持开启。

## 开发说明

开发环境、运行命令、构建和测试说明见 [DEVELOPMENT.md](DEVELOPMENT.md)。
