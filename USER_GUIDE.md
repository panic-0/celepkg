# CelePkg 使用说明

## Favorite

Favorite 是“标记”，不是“启用”。它只方便你识别重要条目，不会影响 Profile。

写入位置：

```text
<Celeste>/Mods/favorites.txt
```

例子：你收藏了 `StrawberryJam2021.zip`。之后应用一个不包含草莓酱的 Profile，它仍然会被禁用。Favorite 不会保护启用状态。

开启“只显示不被依赖的 Mod”时，Favorite 条目仍会显示；但搜索、启用状态、有警告等其他筛选仍然生效。

## Protected

Protected 是“不要让 Profile 自动改这个条目”。它适合常驻 Helper、调试 Mod、手动管理的本地 Mod。

例子：你把 `CollabUtils2.zip` 设为 Protected。之后应用某个 Profile，即使该 Profile 没选 CollabUtils2，CelePkg 也不会直接禁用它。

注意：Protected 不阻止你的手动启用 / 禁用操作。官方地图默认不可禁用，也视为受保护。

## Profile 和 blacklist

Profile 不会删除或移动 Mod 文件。应用 Profile 时，CelePkg 通过改 `blacklist.txt` 控制启用状态。

地图 Profile 和 Mod Profile 分开编辑。每一类都需要选中一个当前 Profile；初始默认是 `Main Profile`。在地图 / Mod 列表中切换启用状态、批量启用 / 禁用，或在 Profile 页面修改启动参数时，都会直接保存到当前 Profile，不需要再点“保存”。

写入位置：

```text
<Celeste>/Mods/blacklist.txt
```

例子：当前地图 Profile 是“草莓酱”。你在地图列表中启用草莓酱大厅和几张小图，这些选择会自动写入“草莓酱”Profile。应用它时，CelePkg 会启用相关地图和可识别依赖，并把其他可管理条目写进 blacklist。被 Protected 的条目不会被 Profile 强行改掉。

Profile 页面里的“覆盖启用情况”是反向操作：读取当前 `blacklist.txt` 对应的实际启用情况，并覆写到当前选中的 Profile。它只覆盖启用列表，不会覆盖 Profile 名称、启动参数、Favorite 或 Protected。这个操作会要求确认，适合你先在游戏目录里手动调整好启用状态，再让 CelePkg 记住它。

也可以从另一个同类 Profile 覆盖当前 Profile。比如你想让 `P2` 先变成 `P1` 的配置，可以先选中 `P2`，选择覆盖范围，再点 `P1` 行右侧的覆盖按钮：

- 只覆盖启用情况：只复制地图 / Mod 启用列表，`P2` 的名称和启动参数不变。
- 覆盖全部内容：复制名称、启用情况和启动参数，但 `P2` 的 Profile id 和创建时间不变。

Profile 列表每一行右侧都有复制按钮。它会完整复制对应的 Profile，生成一个新 Profile 并自动选中。新名称会使用 `原名 Copy`，重名时会自动递增。

名称输入框只用于新建 Profile，不会跟随当前 Profile 名称变化。输入名称后点击右侧“新建空 Profile”会生成一个空配置并自动选中；留空时会自动命名。地图 Profile 中官方只读地图仍会保持启用；用户地图、地图侧 Mod 和启动参数为空。Mod Profile 的启用列表为空。

## 地图 Profile / Mod Profile

地图 Profile 管“玩哪些地图”。Mod Profile 管“开哪些非地图 Mod”。

例子：地图 Profile 选“草莓酱”，Mod Profile 选“录制”。启动时就是“草莓酱地图 + 录制用工具 Mod”两者取并。

顶部有两个启动入口：

- 应用并启动：先应用当前地图 Profile 和 Mod Profile，再启动 Celeste。
- 直接启动：不应用 Profile，不改 blacklist，只直接启动 Celeste。

## 依赖补全

地图声明依赖时，CelePkg 会尝试自动启用对应 Mod。

例子：`A Tour in China` 依赖某些 Helper。你只保存这张地图到 Profile，应用时 CelePkg 会尽量把识别到的依赖一起保留启用。

如果仍然有依赖警告，通常是缺少 Helper，或依赖名称与本地文件 / metadata 对不上。

## 草莓分母

草莓有两种分母：

- 概览分母：默认，贴近游戏章节概览。
- 全部草莓：包含金莓、无冲金、月莓、银莓、彩虹莓等特殊莓。

如官图概览分母是 `175`，全部草莓是 `202`。

## 多存档

多选存档时，CelePkg 会合并草莓 ID，尽量避免重复计数。

例子：`0.celeste` 拿了某图 10 个草莓，`2.celeste` 拿了另外 5 个。两个都选中后，显示的是合并后的进度。

## 刷新缓存

普通刷新偏快，会复用缓存。刷新缓存会重新读取地图文件和统计。

例子：刚更新地图包、刚安装新 Mod、CelePkg 更新了草莓识别规则时，用“刷新缓存并重新扫描地图”。

## 备份

备份只保护 CelePkg 会改的文件，不是整个 Mods 目录。

备份范围：

```text
<Celeste>/Mods/blacklist.txt
<Celeste>/Mods/favorites.txt
```

例子：应用 Profile 后启用状态不对，可以还原应用前的备份，让 blacklist 和 favorites 回到当时状态。
