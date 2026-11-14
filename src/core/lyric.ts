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

/**
 * init lyric
 */
export const init = async() => {
  return lrcInit()
}

/**
 * 发布 ColorOS / OPlus 原生锁屏歌词
 *
 * 系统侧（com.android.systemui）只从当前 MediaSession 的
 * MediaMetadata.extras["lyricInfo"] 读取整条歌词时间轴，然后自己按
 * 播放进度渲染锁屏与 AOD 歌词页，因此这里只需要在歌词变化时发布一次。
 */
const publishLockScreenLyric = (lyric: string, translation: string) => {
  let lyricInfo = ''
  if (lyric) {
    const musicInfo = playerState.musicInfo
    const payload: Record<string, unknown> = {
      songId: musicInfo.id ?? '',
      songName: musicInfo.name ?? '',
      artist: musicInfo.singer ?? '',
      album: musicInfo.album ?? '',
      lyricType: 0,
      lyric,
      noLyric: false,
    }
    // 翻译必须是带时间轴的 LRC，且行起始时间与主歌词一致；
    // 罗马音 / 音译不能放进这个字段，否则锁屏会当成翻译显示
    if (translation) payload.translationLyric = translation
    lyricInfo = JSON.stringify(payload)
  }

  const musicId = playerState.musicInfo.id
  const apply = () => {
    void updateNowPlayingTitles({ lyricInfo })
  }

  apply()
  // 切歌瞬间播放器可能刚重建 MediaMetadata，延迟补发一次，避免刚写入的歌词被覆盖掉。
  // 补发前校验歌曲未变，防止快速切歌时把上一首的歌词贴到新歌上。
  if (lyricInfo) {
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
  publishLockScreenLyric(lyric, translation)
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
