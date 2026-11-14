# ColorOS 锁屏歌词补丁（洛雪音乐助手 / lx-music-mobile）

给洛雪移动版加上 ColorOS / OPlus 原生锁屏歌词（含 AOD 歌词页）。

## 原理

ColorOS 的锁屏歌词不是 App 画的，是 `com.android.systemui` 自己渲染的，数据只从一个地方读：

> 当前活跃 MediaSession 的 `MediaMetadata.extras["lyricInfo"]`（JSON 字符串）

洛雪原本只在开启「蓝牙歌词」时写 `android.media.metadata.LYRICS`（整篇纯文本，给车机用），ColorOS 不认这个 key，所以锁屏只有封面没有词。

本补丁做两件事：

1. `src/core/lyric.ts`：歌词变化时，把当前歌曲信息 + 带时间轴的 LRC 组装成 `lyricInfo` 发布出去；
2. `scripts/patch-coloros-lyric.js`：给 `react-native-track-player` 的 `MetadataManager.updateTitles` 补一段逻辑，把 `lyricInfo` 真正写进 MediaMetadata。

`lyricInfo` 的字段（ColorOS 私有契约）：

```json
{
  "songName": "歌名",
  "artist": "歌手",
  "album": "专辑",
  "songId": "歌曲 id",
  "lyricType": 0,
  "lyric": "[00:10.000]第一行\n[00:14.500]第二行\n",
  "translationLyric": "[00:10.000]翻译第一行\n",
  "noLyric": false
}
```

只需要发布一次整条时间轴，进度推进由系统自己算。

## 用法（GitHub Actions 出包）

1. 在 GitHub 上 fork `lyswhut/lx-music-mobile`（fork 后若 Actions 是关的，去 Actions 页点一下启用）。
2. 把本补丁包解压覆盖到 fork 的仓库根目录（保持目录结构）：

   ```
   src/core/lyric.ts
   src/plugins/player/utils.ts
   scripts/patch-coloros-lyric.js
   .github/workflows/build-coloros-lyric.yml
   package.json
   ```

   Termux 里操作：

   ```bash
   git clone https://github.com/<你的账号>/lx-music-mobile
   cd lx-music-mobile
   unzip -o ~/storage/downloads/lx-coloros-lyric-patch.zip
   git add -A
   git commit -m "feat: ColorOS lock screen lyric"
   git push
   ```

3. push 后 Actions 自动跑 `Build ColorOS Lyric APK`，也可以手动 `Run workflow`。
4. 跑完在 Actions 页面底部 `Artifacts` 下载 `lx-music-coloros-lyric`，解压后取 `app-arm64-v8a-release.apk`（一加 PLC110 用这个）。

## 怎么确认补丁真的跑了

洛雪自带日志页：**设置 → 其他 → 日志**。每次切歌/歌词加载时会出现一行

```
[ColorOS lyric] <歌曲id> <字节数> chars, <行数> lines
```

- 没有这行 → JS 层没执行到发布逻辑，问题在代码；
- 有这行但锁屏没歌词 → 数据发出去了，是系统侧没消费（准入/字段问题）。

## 注意事项

- **签名和官方版不同**：装之前必须先卸载官方洛雪，否则会提示签名冲突。卸载前先在 App 里把歌曲列表备份成文件（设置 → 备份与恢复）或同步到 WebDAV。
- 构建用的是仓库自带的 `debug.keystore` 签名，每次构建签名一致，可以覆盖升级（但只在你自己这套构建之间）。
- 如果 Actions 构建报错，先确认 `npm ci` 里 `postinstall` 那段有没有报 `[coloros-lyric] 定位 updateTitles 失败`——那说明上游 track-player 改了 `updateTitles` 的实现，需要更新补丁锚点。
- 逐字（卡拉 OK 扫光）暂未接入：ColorOS 需要 `rawLyric` 增强 LRC，格式是 `[00:10.000]<00:10.000>你<00:10.700>好`，洛雪的 `lxlrc` 格式不保证一致，等行级歌词验证通过后再加。
- 歌词偏移（设置里的 offset）暂未应用到锁屏歌词，如果 App 内和锁屏有固定偏差，告诉我，我把 offset 平移加进去。

## 回滚

删掉这几处改动即可，或者直接用官方 release 覆盖安装（需要先卸载本构建）。
