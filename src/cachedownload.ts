import { request } from "./tsimports"
import { asyncFile } from "./asyncapi/file"

// 视频音频缓存下载管理器
// 关键点：下载任务与完成回调都由本模块（而非播放器页面）持有，
// 页面销毁/返回后缓存仍会继续并落盘，避免"缓存到一半就中断"。

interface CacheTaskOptions {
  bvid: string
  title: string
  coverUrl: string
  author: string
  filename: string
  url: string
  headers: string
  totalSize: number
}

interface CacheTask {
  options: CacheTaskOptions
  callback: any
  headerRetried: boolean
  retries: number
}

// 同一文件同时只允许一个下载任务
const tasks: Record<string, CacheTask> = {}

// 校验 m4s：文件足够大且开头为 ftyp box，
// 避免把错误页/半截文件当作缓存写入列表
async function isValidM4s(uri: string): Promise<boolean> {
  try {
    const fileInfo = await asyncFile.get({ uri })
    if (!fileInfo || !fileInfo.length || fileInfo.length < 1024) {
      return false
    }
    const header = await asyncFile.readArrayBuffer({ uri, position: 0, length: 12 })
    if (!header || header.length < 8) {
      return false
    }
    const boxType = String.fromCharCode(header[4], header[5], header[6], header[7])
    return boxType === "ftyp"
  } catch (e) {
    return false
  }
}

function finishRecord(task: CacheTask, status: string, uri?: string): void {
  if (global.downloadrecords) {
    global.downloadrecords.DownloadRecordManager.finishRecord(task.options.filename, status, uri)
  }
}

function notify(task: CacheTask, result: any): void {
  delete tasks[task.options.filename]
  if (typeof task.callback === "function") {
    try {
      task.callback(result)
    } catch (e) {
      global.logger.error(`[CacheDownloadManager] callback error: ${e.toString()}`)
    }
  }
}

async function handleSuccess(task: CacheTask, uri: string): Promise<void> {
  const usable = await isValidM4s(uri)
  if (!usable) {
    finishRecord(task, "fail")
    notify(task, { status: "fail" })
    return
  }

  finishRecord(task, "success", uri)

  // 先通知播放器，避免写缓存列表拖慢播放
  notify(task, { status: "success", uri })

  // 写入缓存列表也放在模块层：播放器页面已销毁时同样能完成
  try {
    if (global.savedcontent) {
      const exists = await global.savedcontent.SavedContentManager.checkVideoAudioExists(task.options.bvid)
      if (!exists) {
        await global.savedcontent.SavedContentManager.storeVideoAudio(
          task.options.title,
          uri,
          task.options.coverUrl,
          task.options.author,
          task.options.bvid
        )
      }
    }
  } catch (e) {
    global.logger.error(`[CacheDownloadManager] save content error: ${e.toString()}`)
  }
}

function handleFail(task: CacheTask, usedHeaders: boolean, error: any): void {
  const errorText = error && (error.message || error)
  // 部分机型不接受自定义 header：去掉 header 重试一次
  if (usedHeaders && !task.headerRetried && errorText && String(errorText).includes("invalid header")) {
    task.headerRetried = true
    createRequest(task, false)
    return
  }
  // 其它失败（网络抖动等）自动重试一次，避免缓存到一半直接中止
  if (task.retries < 1) {
    task.retries++
    setTimeout(() => {
      createRequest(task, usedHeaders)
    }, 1000)
    return
  }
  finishRecord(task, "fail")
  notify(task, { status: "fail" })
}

function createRequest(task: CacheTask, useHeaders: boolean): void {
  const params: any = {
    url: task.options.url,
    filename: task.options.filename
  }
  if (useHeaders) {
    params.header = task.options.headers
  }
  request.download({
    ...params,
    success: function (res) {
      request.onDownloadComplete({
        token: res.token,
        success: function (result) {
          handleSuccess(task, result.uri)
        },
        fail: function (error) {
          handleFail(task, useHeaders, error)
        }
      })
    },
    fail: function (error) {
      handleFail(task, useHeaders, error)
    }
  })
}

export class CacheDownloadManager {
  // 判断该文件的下载记录是否仍在进行中
  private static hasActiveRecord(filename: string): boolean {
    if (!global.downloadrecords) return false
    const records = global.downloadrecords.DownloadRecordManager.listRecords() || []
    return records.some((r) => r.filename === filename && r.status === "downloading")
  }

  // 开始一次缓存下载；同一 filename 已在下载时复用旧任务，只替换回调
  static start(options: CacheTaskOptions, callback?: any): void {
    const existing = tasks[options.filename]
    if (existing) {
      // 记录已不是 downloading，说明旧任务已静默失效（回调丢失等）：
      // 丢弃死任务，允许重新发起，避免一直卡在"下载中"
      if (this.hasActiveRecord(options.filename)) {
        existing.callback = callback
        return
      }
      delete tasks[options.filename]
    }

    const task: CacheTask = { options, callback, headerRetried: false, retries: 0 }
    tasks[options.filename] = task

    if (global.downloadrecords) {
      global.downloadrecords.DownloadRecordManager.startRecord(
        options.bvid,
        options.title,
        options.coverUrl,
        options.author,
        options.filename,
        options.totalSize
      )
    }
    createRequest(task, true)
  }

  static isDownloading(filename: string): boolean {
    return !!tasks[filename]
  }
}
