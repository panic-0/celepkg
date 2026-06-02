# CelePkg

CelePkg 是一个面向 Celeste 的本地 Mod / 地图管理器。它使用 Tauri 2 + React 构建，用来扫描 Celeste 官方地图与 `Mods` 目录，管理地图和其他 Mod 的启用状态，编辑 Profile，查看存档统计，并在修改游戏文件前自动备份。

## 功能

- 扫描 Celeste `Mods` 目录，识别地图包、其他 Mod、Helper 测试图和依赖关系。
- 识别 Celeste 官方地图，并从游戏自带汉化中读取章节名称。
- 读取地图存档统计，展示完成状态、死亡数、用时、草莓、心和磁带等信息。
- 支持多存档统计，可在显示设置中选择参与统计的存档。
- 草莓分母可切换：
  - 默认使用游戏概览分母。
  - 可切换为包含金莓、月莓、银莓、彩虹莓等特殊莓的全部草莓数。
- 管理地图 Profile 和其他 Mod Profile，编辑会自动保存到当前 Profile。
- 支持新建空 Profile、复制任意 Profile，也支持从另一个同类 Profile 覆盖当前 Profile；覆盖时可选择只覆盖启用情况或覆盖全部内容。
- 顶部支持“应用并启动”和“直接启动”：
  - 应用并启动会先应用当前地图 / Mod Profile，再启动游戏。
  - 直接启动不会改写 Profile 或 `blacklist.txt`。
- 支持删除 Profile，并可为新建 Profile 指定名称。
- 支持收藏和保护条目：
  - 收藏状态写入 `Mods/favorites.txt`。
  - Profile 应用会写入 `Mods/blacklist.txt`。
  - Protected 条目不会被 Profile 操作直接启用或禁用。
- 支持游戏文件备份与还原：
  - 手动备份。
  - 默认开启“修改前自动备份”。
  - 可打开备份根目录或单个备份快照目录。
- 支持普通刷新和“刷新缓存并重新扫描地图”，用于地图文件或缓存口径变化后的强制重扫。

## 使用说明

面向玩家的机制说明和典型用法示例见 [USER_GUIDE.md](USER_GUIDE.md)。

## 备份说明

备份只覆盖 CelePkg 会修改的游戏文件：

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

如果备份时目标文件不存在，`manifest.json` 会记录该文件不存在；还原时不会凭空创建空文件，若目标文件后来被创建则会删除它以恢复备份时状态。

CelePkg 自身配置 `state.json` 不会被备份或还原。

## 数据写入位置

CelePkg 可能修改的游戏目录文件：

- `<Celeste>/Mods/blacklist.txt`
- `<Celeste>/Mods/favorites.txt`
- `<Celeste>/celepkg/backups/`

应用配置和扫描缓存位于系统配置目录下的 `celepkg` 文件夹。扫描缓存可重新生成，不属于备份范围。

## 注意事项

- 使用前请确认 Celeste 路径指向包含 `Mods` 目录的游戏目录。
- 官方地图只用于查看统计，不会被 CelePkg 禁用。
- 应用 Profile 会重写 CelePkg 管理范围内的 blacklist 条目，但会保留非管理范围内容。
- Profile 页面可以从当前游戏或另一个同类 Profile 覆盖当前 Profile。从当前游戏覆盖时只覆盖启用情况；从 Profile 覆盖时可选择只覆盖启用情况或覆盖全部内容。Favorite 和 Protected 不会被覆盖。
- 修改前自动备份默认开启，建议保持开启。

## 开发说明

开发环境、运行命令、构建和测试说明见 [DEVELOPMENT.md](DEVELOPMENT.md)。
