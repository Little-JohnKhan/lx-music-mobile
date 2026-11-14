import {
  play as lrcPlay,
  setLyric as lrcSetLyric,
  pause as lrcPause,
  setPlaybackRate as lrcSetPlaybackRate,
  toggleTranslation as lrcToggleTranslation,
  toggleRoma as lrcToggleRoma,
  init as lrcInit,
} from '@/plugins/lyric'
import {
  playDesktopLyric,
  setDesktopLyric,
  pauseDesktopLyric,
  setDesktopLyricPlaybackRate,
  toggleDesktopLyricTranslation,
  toggleDesktopLyricRoma,
} from '@/core/desktopLyric'
import { getPosition } from '@/plugins/player'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { updateNowPlayingTitles } from '@/plugins/player/utils'
import { log } from '@/utils/log'

/**
 * init lyric
 */
export const init = async() => {
  return lrcInit()
}

/**
 * 把任意 LRC 规范成「时间标签 + 文本」的干净行。
 * 丢掉 [ti:] / [ar:] / [by:] / [offset:] 之类的元数据行、纯空行和没有时间轴的装饰行，
 * ColorOS 的解析器对不合规的行很敏感，一条坏数据可能让整段歌词都不显示。
 */
const normalizeLrc = (raw: string): string => {
  if (!raw) return ''
  const out: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const tags = line.match(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/g)
    if (!tags) continue
    const text = line.replace(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/g, '').trim()
    if (!text) continue
    for (const tag of tags) out.push(tag + text)
  }
  return out.join('\n')
}

/**
 * 发布 ColorOS / OPlus 原生锁屏歌词
 *
 * 系统侧（com.android.systemui）只从当前 MediaSession 的
 * MediaMetadata.extras["lyricInfo"] 读取整条歌词时间轴，然后自己按
 * 播放进度渲染锁屏与 AOD 歌词页，因此这里只需要在歌词变化时发布一次。
 */
/**
 * ColorOS 17 的锁屏歌词真正读取的两个 key 是
 * MediaMetadata.extras["android.media.metadata.LYRICS_LRC"] 和 extras["lyrics"]，
 * 值为带时间轴的 LRC。lyricInfo 那套 JSON 契约属于另一条路径，一起发不冲突。
 */
const publishLockScreenLyric = (rawLyric: string) => {
  const musicInfo = playerState.musicInfo
  const lrc = normalizeLrc(rawLyric)
  const text = lrc
    ? lrc.split('\n').map(line => line.replace(/^\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/, '')).filter(Boolean).join('\n')
    : ''
  let lyricInfo = ''
  if (lrc) {
    lyricInfo = JSON.stringify({
      songId: musicInfo.id ?? '',
      songName: musicInfo.name ?? '',
      artist: musicInfo.singer ?? '',
      album: musicInfo.album ?? '',
      lyricType: 0,
      lyric: lrc,
      noLyric: false,
    })
  }

  const musicId = musicInfo.id
  const apply = () => {
    void updateNowPlayingTitles({ lyricInfo, lyricLrc: lrc, lyricText: text })
  }

  apply()
  log.info('[ColorOS lyric]', musicId ?? '-', lrc.length, 'chars,', lrc ? lrc.split('\n').length : 0, 'lines')
  // 切歌瞬间播放器可能刚重建 MediaMetadata，延迟补发一次，避免刚写入的歌词被覆盖掉。
  // 补发前校验歌曲未变，防止快速切歌时把上一首的歌词贴到新歌上。
  if (lrc) {
    setTimeout(() => {
      if (playerState.musicInfo.id === musicId) apply()
    }, 1200)
  }
}

/**
 * set lyric
 * @param lyric lyric str
 * @param translation lyric translation
 */
const handleSetLyric = async(lyric: string, translation = '', romalrc = '') => {
  lrcSetLyric(lyric, translation, romalrc)
  await setDesktopLyric(lyric, translation, romalrc)
  if (settingState.setting['player.isShowBluetoothFullLyric']) {
    void updateNowPlayingTitles({
      lyric,
    })
  }
  publishLockScreenLyric(lyric)
}

/**
 * play lyric
 * @param time play time
 */
export const handlePlay = (time: number) => {
  lrcPlay(time)
  void playDesktopLyric(time)
}

/**
 * pause lyric
 */
export const pause = () => {
  lrcPause()
  void pauseDesktopLyric()
}

/**
 * stop lyric
 */
export const stop = () => {
  void handleSetLyric('')
}

/**
 * set playback rate
 * @param playbackRate playback rate
 */
export const setPlaybackRate = async(playbackRate: number) => {
  lrcSetPlaybackRate(playbackRate)
  await setDesktopLyricPlaybackRate(playbackRate)
  if (playerState.isPlay) {
    setTimeout(() => {
      void getPosition().then((position) => {
        handlePlay(position * 1000)
      })
    })
  }
}

/**
 * toggle show translation
 * @param isShowTranslation is show translation
 */
export const toggleTranslation = async(isShowTranslation: boolean) => {
  lrcToggleTranslation(isShowTranslation)
  await toggleDesktopLyricTranslation(isShowTranslation)
  if (playerState.isPlay) play()
}

/**
 * toggle show roma lyric
 * @param isShowLyricRoma is show roma lyric
 */
export const toggleRoma = async(isShowLyricRoma: boolean) => {
  lrcToggleRoma(isShowLyricRoma)
  await toggleDesktopLyricRoma(isShowLyricRoma)
  if (playerState.isPlay) play()
}

export const play = () => {
  void getPosition().then((position) => {
    handlePlay(position * 1000)
  })
}


export const setLyric = async() => {
  if (!playerState.musicInfo.id) return
  if (playerState.musicInfo.lrc) {
    let tlrc = ''
    let rlrc = ''
    if (playerState.musicInfo.tlrc) tlrc = playerState.musicInfo.tlrc
    if (playerState.musicInfo.rlrc) rlrc = playerState.musicInfo.rlrc
    await handleSetLyric(playerState.musicInfo.lrc, tlrc, rlrc)
  }

  if (playerState.isPlay) play()
}
