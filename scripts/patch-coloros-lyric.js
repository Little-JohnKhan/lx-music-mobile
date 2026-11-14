#!/usr/bin/env node
/**
 * ColorOS / OPlus 锁屏歌词补丁（v3）
 *
 * ColorOS 17 的锁屏歌词实际读取的是 MediaMetadata 里的：
 *   - "android.media.metadata.LYRICS_LRC"（带时间轴 LRC）
 *   - "lyrics"（带时间轴 LRC，小写别名）
 *   - "android.media.metadata.LYRICS" / "lyric"（纯文本）
 * 另外兼容 lyricInfo（JSON 契约，部分 ColorOS/Mei 路线使用）。
 *
 * 必须在 npm ci / npm install 之后执行（node_modules 就绪后）。
 * 脚本幂等：重复执行不会重复插入。
 */
const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  __dirname, '..', 'node_modules', 'react-native-track-player', 'android', 'src', 'main', 'java',
  'com', 'guichaguri', 'trackplayer', 'service', 'metadata', 'MetadataManager.java'
)

const MARKER = '// coloros-lyric v6'

const ANCHOR = `      if (data.containsKey("lyric")) {
        prevMetadata.putString("android.media.metadata.LYRICS", data.getString("lyric"));
      }`

const PATCHED = ANCHOR + `
      if (data.containsKey("lyricInfo")) {
        String lyricInfo = data.getString("lyricInfo");
        if (lyricInfo == null || lyricInfo.length() == 0) prevMetadata.putString("lyricInfo", null);
        else prevMetadata.putString("lyricInfo", lyricInfo);
      }
      if (data.containsKey("lyricLrc")) {
        String lyricLrc = data.getString("lyricLrc");
        prevMetadata.putString("android.media.metadata.LYRICS_LRC", lyricLrc);
        prevMetadata.putString("lyrics", lyricLrc);
        // ColorOS 私有能力开关，缺这个系统不会给歌词入口
        prevMetadata.putString("oplus.media.config", "1");
      }
      if (data.containsKey("lyricText")) {
        String lyricText = data.getString("lyricText");
        prevMetadata.putString("android.media.metadata.LYRICS", lyricText);
        prevMetadata.putString("lyric", lyricText);
      } ${MARKER}`

function fail(msg) {
  console.error('[coloros-lyric] ' + msg)
  process.exit(1)
}

function main() {
  if (!fs.existsSync(TARGET)) {
    fail('找不到 ' + TARGET + '\n请先在项目根目录执行 npm ci / npm install')
  }

  const raw = fs.readFileSync(TARGET, 'utf8')
  if (raw.includes(MARKER)) {
    console.log('[coloros-lyric] 已是最新补丁（' + MARKER + '），跳过')
    return
  }

  const isCrlf = raw.includes('\r\n')
  const lf = raw.replace(/\r\n/g, '\n')

  const hits = lf.split(ANCHOR).length - 1
  if (hits !== 1) {
    fail('定位 updateTitles 失败（命中 ' + hits + ' 次），请确认 react-native-track-player 版本未被上游改动')
  }

  let out = lf.replace(ANCHOR, PATCHED)
  if (isCrlf) out = out.replace(/\n/g, '\r\n')

  fs.writeFileSync(TARGET, out)
  console.log('[coloros-lyric] 补丁已应用：LYRICS_LRC / lyrics / LYRICS / lyric / lyricInfo')
}

main()
