# CelePkg 使用说明

这份说明不重复介绍界面上已经很直观的按钮，而是解释几个容易误会、但会影响实际文件和启用状态的机制。

## Favorite 是标记，不是启用

Favorite 只表示“我想重点关注这个条目”。它不会启用或禁用 Mod，也不会影响 Profile 应用结果。

CelePkg 会把收藏写入：

```text
<Celeste>/Mods/favorites.txt
```

例子：

- 你收藏了 `Strawberry Jam 2021`，它会更容易被你在列表里识别。
- 之后你应用一个不包含 `Strawberry Jam 2021` 的地图 Profile，它仍然可能被禁用。
- Favorite 不会保护它不被禁用；要做到这一点应使用 Protected。

适合使用 Favorite 的场景：

- 标记常玩的地图包。
- 标记以后想清理或排查的 Mod。
- 标记大型 Collab，方便在一堆地图中快速找到。

## Protected 会阻止 Profile 改动启用状态

Protected 表示“这个条目的启用状态由我手动控制，不让 Profile 自动改”。它主要影响应用 Profile 时的行为。

例子 1：保护一个 Helper

1. 你一直需要 `Everest`、`CollabUtils2` 或某个 Helper 保持启用。
2. 把它设为 Protected。
3. 之后应用某个 Mod Profile，即使该 Profile 没选它，CelePkg 也不会直接把它禁用。

例子 2：保护一个临时测试 Mod

1. 你正在调试一个本地文件夹 Mod。
2. 把它设为 Protected。
3. 切换 Profile 时，它不会被 CelePkg 顺手改掉。

需要注意：

- 官方地图默认不可禁用，也视为受保护。
- Protected 不是收藏；它不表示喜欢，只表示 Profile 不应自动改它。
- 如果你手动点启用 / 禁用，Protected 不会阻止你的手动操作。

## Profile 会写 blacklist，不会删除文件

Profile 保存的是一组“应该启用哪些地图 / Mod”的状态。应用 Profile 时，CelePkg 通过更新 `blacklist.txt` 来控制启用状态。

会写入：

```text
<Celeste>/Mods/blacklist.txt
```

不会做的事：

- 不会删除 `.zip`。
- 不会移动 Mod 文件。
- 不会改地图包内容。

例子：准备一个“草莓酱”Profile

1. 启用 `StrawberryJam2021.zip` 和它需要的依赖。
2. 保存为地图 Profile，例如“草莓酱”。
3. 以后应用这个 Profile，CelePkg 会让相关地图启用，并把不属于这组配置的可管理条目写进 blacklist。
4. 如果某个 Helper 被 Protected，Profile 不会强行禁用它。

## 地图 Profile 和 Mod Profile 是两套东西

地图 Profile 关注“玩哪些地图”。Mod Profile 关注“开哪些非地图 Mod”。

例子：

- 地图 Profile：“官图”“草莓酱”“春合”“国人图包”。
- Mod Profile：“正常游玩”“录制视频”“调试 Mod”。

这样可以组合：

- 地图 Profile 选“草莓酱”。
- Mod Profile 选“录制视频”。
- 启动时就是“草莓酱地图 + 录制需要的工具 Mod”。

## 依赖会被自动补上

地图包声明了依赖时，CelePkg 会尝试找到对应 Mod 并在应用 Profile 时一起启用。

例子：

1. 你保存了一个只包含 `A Tour in China` 的地图 Profile。
2. 这个地图依赖某些 Helper。
3. 应用 Profile 时，CelePkg 会把能识别到的依赖 Mod 一起保留启用。

如果列表里出现依赖警告，通常表示：

- 缺少对应 Helper。
- 依赖名称和本地文件名 / metadata 对不上。
- 依赖存在但被放在 CelePkg 无法识别的位置。

## 草莓分母有两种口径

CelePkg 支持两种草莓分母：

- 概览分母：默认，贴近游戏章节概览显示。
- 全部草莓：包含特殊莓，例如金莓、无冲金、月莓、银莓、彩虹莓。

官图例子：

- 概览分母是 `175`。
- 全部草莓是 `202`。
- 第一章可能出现类似 `24/20`，这是正常的：分子来自存档已收集数，可能包含金莓；分母如果使用概览口径，就仍然是红莓概览数。

什么时候用概览分母：

- 你想和游戏章节面板看到的分母接近。
- 你主要关心普通红莓进度。

什么时候用全部草莓：

- 你想看完整收集目标。
- 你在查金莓、银莓、彩虹莓等特殊莓统计。

## 多存档统计会合并草莓 ID

显示设置里可以选择多个数字存档参与统计。CelePkg 会读取这些存档，并合并已收集草莓 ID。

例子：

- `0.celeste` 里某图拿了 10 个草莓。
- `2.celeste` 里同一图拿了另外 5 个草莓。
- 同时选择两个存档后，CelePkg 会按草莓 ID 合并，尽量避免重复计数。

适合使用多存档的场景：

- 你有主档和练习档。
- 不同存档分别玩过不同地图。
- 想看“这些存档加起来碰过哪些收集物”。

如果你只想看某一个存档的真实个人进度，只选那个存档。

## 刷新和刷新缓存不是一回事

普通刷新会尽量使用已有扫描缓存，速度更快。

刷新缓存并重新扫描地图会重新读取地图文件、Mod 包和存档签名。

例子：

- 你刚把 `StrawberryJam2021.zip` 换成新版本。
- 你刚安装了一个新地图包。
- CelePkg 更新后改变了草莓识别规则。

这些情况下应使用“刷新缓存并重新扫描地图”。

## 自动备份只保护 CelePkg 会改的文件

CelePkg 的备份不是整个 `Mods` 文件夹备份。它只备份自己会改的文件：

```text
<Celeste>/Mods/blacklist.txt
<Celeste>/Mods/favorites.txt
```

备份位置：

```text
<Celeste>/celepkg/backups/
```

例子：

1. 你应用了一个 Profile，结果发现启用状态不是想要的。
2. 到备份还原里选择应用前创建的备份。
3. 还原后，`blacklist.txt` 和 `favorites.txt` 回到备份时的状态。

不会备份的内容：

- Mod zip 文件本身。
- 存档文件。
- CelePkg 自己的配置和扫描缓存。

## 清理 Mod 时建议先看“不被依赖”

“不被依赖”筛选可以帮助找出没有被当前地图或其他 Mod 声明依赖的条目。

例子：

- 某个皮肤 Mod 或工具 Mod 没被任何地图依赖，但你仍然可能想保留它。
- 某个 Helper 没被识别为依赖，不代表一定没用，可能是地图没有正确声明依赖。

因此这个筛选适合辅助判断，不适合无脑删除文件。

## 推荐工作流

如果你经常切换大图包，可以这样用：

1. 把常驻 Helper 或调试 Mod 设为 Protected。
2. 为每个大图包保存一个地图 Profile，例如“官图”“草莓酱”“春合”。
3. 为不同游玩环境保存 Mod Profile，例如“正常”“录制”“调试”。
4. 切换前保持自动备份开启。
5. 应用 Profile 后，如果统计或草莓总数不对，使用刷新缓存重新扫描。
