#!/usr/bin/env node
/**
 * ColorOS / OPlus 锁屏歌词补丁（v7）
 *
 * 解决的坑：track-player 在切歌、封面加载完成等时机都会重新 new 一个
 * MediaMetadata.Builder 再 setMetadata，把我们写进去的歌词字段全部冲掉，
 * 导致锁屏歌词入口按钮闪一下就消失。
 *
 * 做法：
 *   1. 用字段记住最近一次的歌词数据；
 *   2. 所有 setMetadata(metadata.build()) 出口统一走 applyColorOsLyric() 补字段；
 *   3. 切歌时清空，等待 JS 重新发布。
 *
 * 必须在 npm ci / npm install 之后执行（node_modules 就绪后）。
 */
const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  __dirname, '..', 'node_modules', 'react-native-track-player', 'android', 'src', 'main', 'java',
  'com', 'guichaguri', 'trackplayer', 'service', 'metadata', 'MetadataManager.java'
)

const MARKER = '// coloros-lyric v7'

const FIELDS_ANCHOR = `    private MediaMetadataCompat.Builder prevMetadata = null;`

const FIELDS_NEW = FIELDS_ANCHOR + `

    // coloros-lyric: 记住最近一次发布的歌词，元数据被重建时补回去
    private String colorOsLyricLrc;
    private String colorOsLyricText;
    private String colorOsLyricInfo;`

const HELPER_ANCHOR = `    public void updateTitles(Bundle data) {`

const HELPER_NEW = `    private MediaMetadataCompat.Builder applyColorOsLyric(MediaMetadataCompat.Builder b) {
      if (b == null) return b;
      if (colorOsLyricLrc != null && colorOsLyricLrc.length() > 0) {
        b.putString("android.media.metadata.LYRICS_LRC", colorOsLyricLrc);
        b.putString("lyrics", colorOsLyricLrc);
        b.putString("oplus.media.config", "1");
      }
      if (colorOsLyricText != null && colorOsLyricText.length() > 0) {
        b.putString("android.media.metadata.LYRICS", colorOsLyricText);
        b.putString("lyric", colorOsLyricText);
      }
      if (colorOsLyricInfo != null && colorOsLyricInfo.length() > 0) {
        b.putString("lyricInfo", colorOsLyricInfo);
      }
      return b;
    }

${HELPER_ANCHOR}`

const LYRIC_ANCHOR = `      if (data.containsKey("lyric")) {
        prevMetadata.putString("android.media.metadata.LYRICS", data.getString("lyric"));
      }`

const LYRIC_NEW = LYRIC_ANCHOR + `
      if (data.containsKey("lyricInfo")) {
        colorOsLyricInfo = data.getString("lyricInfo");
      }
      if (data.containsKey("lyricLrc")) {
        colorOsLyricLrc = data.getString("lyricLrc");
      }
      if (data.containsKey("lyricText")) {
        colorOsLyricText = data.getString("lyricText");
      }
      applyColorOsLyric(prevMetadata); ${MARKER}`

const CLEAR_ANCHOR = `    public void updateMetadata(ExoPlayback playback, TrackMetadata track, boolean isPlaying) {`

const CLEAR_NEW = CLEAR_ANCHOR + `
        // coloros-lyric: 切歌时清空上一首的歌词，等 JS 重新发布
        colorOsLyricLrc = null;
        colorOsLyricText = null;
        colorOsLyricInfo = null;`

const SETMETA_OLD = `session.setMetadata(metadata.build());`
const SETMETA_NEW = `session.setMetadata(applyColorOsLyric(metadata).build());`

function fail(msg) {
  console.error('[coloros-lyric] ' + msg)
  process.exit(1)
}

function replaceOnce(text, from, to, label) {
  const hits = text.split(from).length - 1
  if (hits < 1) fail(`定位 ${label} 失败`)
  return text.split(from).join(to)
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
  let s = raw.replace(/\r\n/g, '\n')

  // 1. 字段
  if (!s.includes('colorOsLyricLrc')) s = replaceOnce(s, FIELDS_ANCHOR, FIELDS_NEW, 'prevMetadata 字段')
  // 2. helper
  if (!s.includes('applyColorOsLyric')) s = replaceOnce(s, HELPER_ANCHOR, HELPER_NEW, 'updateTitles 方法')
  // 3. updateTitles 内部逻辑
  s = replaceOnce(s, LYRIC_ANCHOR, LYRIC_NEW, 'lyric 分支')
  // 4. 切歌清空
  if (!s.includes('切歌时清空上一首的歌词')) s = replaceOnce(s, CLEAR_ANCHOR, CLEAR_NEW, 'updateMetadata 方法')
  // 5. 所有 setMetadata 出口
  s = replaceOnce(s, SETMETA_OLD, SETMETA_NEW, 'session.setMetadata 调用')

  if (isCrlf) s = s.replace(/\n/g, '\r\n')
  fs.writeFileSync(TARGET, s)

  const setMetaCount = s.split(SETMETA_NEW).length - 1
  console.log('[coloros-lyric] 补丁已应用：字段记忆 + ' + setMetaCount + ' 处 setMetadata 出口补字段')
}

main()
