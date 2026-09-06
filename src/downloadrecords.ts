import { asyncFile } from "./asyncapi/file"

export type DownloadRecordStatus = "downloading" | "success" | "fail" | "interrupted"

export interface DownloadRecord {
    id: string
    bvid: string
    filename: string
    title: string
    coverUrl: string
    author: string
    status: DownloadRecordStatus
    maxSpeed: number   // bytes/s
    size: number       // bytes
    startTime: number
    endTime: number
}

const baseUri = "internal://files/bilisavedcontent/"
const recordsFileUri = `${baseUri}downloadrecords.json`
const MAX_RECORDS = 50
const SAMPLE_INTERVAL = 500
// 采样超时保护：页面销毁导致完成回调丢失时，避免采样器永久空转
const MAX_SAMPLE_MS = 15 * 60 * 1000

let records: DownloadRecord[] = []

// 网速采样器（播放器同一时刻只有一个音频缓存下载）
let sampler: {
    filename: string
    recordId: string
    timer: any
    lastBytes: number
    lastTime: number
    startedAt: number
} | null = null

function generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        const r = (Math.random() * 16) | 0
        const v = c === "x" ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

async function saveRecords(): Promise<void> {
    try {
        await asyncFile.writeText({
            uri: recordsFileUri,
            text: JSON.stringify(records)
        })
    } catch (e) {
        global.logger.error(`[DownloadRecordManager] saveRecords Error: ${e.toString()}`)
    }
}

async function loadRecords(): Promise<void> {
    try {
        const fileExists = await asyncFile.access({ uri: recordsFileUri })
        if (fileExists) {
            records = JSON.parse(await asyncFile.readText({ uri: recordsFileUri }))
        } else {
            records = []
        }
    } catch (e) {
        records = []
    }
}

function stopSampler(): void {
    if (sampler && sampler.timer) {
        clearInterval(sampler.timer)
    }
    sampler = null
}

// 轮询下载目标文件的当前大小，计算瞬时网速并记录峰值
// （request.download 无进度回调，只能通过 file.get 采样；
//   若引擎在下载期间不暴露临时文件，采样无效，结束时回退为平均速度）
function startSampler(filename: string, recordId: string): void {
    stopSampler()
    const record = records.find(r => r.id === recordId)
    if (!record) return

    const state = {
        filename,
        recordId,
        timer: null as any,
        lastBytes: 0,
        lastTime: 0,
        startedAt: Date.now()
    }
    state.timer = setInterval(async () => {
        try {
            const info = await asyncFile.get({ uri: `internal://files/${filename}` })
            const now = Date.now()
            const bytes = (info && info.length) || 0
            if (state.lastTime > 0 && bytes > state.lastBytes) {
                const speed = (bytes - state.lastBytes) / ((now - state.lastTime) / 1000)
                if (speed > record.maxSpeed) {
                    record.maxSpeed = Math.round(speed)
                }
            }
            if (bytes > 0) {
                record.size = bytes
            }
            state.lastBytes = bytes
            state.lastTime = now
        } catch (e) {
            // 下载中的临时文件尚不可见时跳过本次采样
        }
        if (Date.now() - state.startedAt > MAX_SAMPLE_MS) {
            DownloadRecordManager.finishRecord(filename, "interrupted")
        }
    }, SAMPLE_INTERVAL)
    sampler = state
}

export class DownloadRecordManager {
    // 初始化时加载记录；上个会话残留的 downloading 记录回调已丢失，标记为中断
    static async initialize(): Promise<void> {
        await loadRecords()
        let dirty = false
        for (const r of records) {
            if (r.status === "downloading") {
                r.status = "interrupted"
                r.endTime = Date.now()
                dirty = true
            }
        }
        if (dirty) {
            await saveRecords()
        }
        global.logger.log("loaded DownloadRecords", records.length)
    }

    // 开始一条下载记录并启动网速采样（filename 为 request.download 的目标文件名）
    static async startRecord(bvid: string, title: string, coverUrl: string, author: string, filename: string): Promise<string | void> {
        try {
            // 新下载开始：旧的进行中记录全部标记中断
            let dirty = false
            for (const r of records) {
                if (r.status === "downloading") {
                    r.status = "interrupted"
                    r.endTime = Date.now()
                    dirty = true
                }
            }
            const record: DownloadRecord = {
                id: generateUUID(),
                bvid: bvid || "",
                filename,
                title: title || "未知视频",
                coverUrl: coverUrl || "",
                author: author || "未知作者",
                status: "downloading",
                maxSpeed: 0,
                size: 0,
                startTime: Date.now(),
                endTime: 0
            }
            records.unshift(record)
            if (records.length > MAX_RECORDS) {
                records = records.slice(0, MAX_RECORDS)
            }
            await saveRecords()
            if (dirty) {
                global.logger.log("[DownloadRecordManager] 之前的下载记录已标记中断")
            }
            startSampler(filename, record.id)
            return record.id
        } catch (e) {
            global.logger.error(`[DownloadRecordManager] startRecord Error: ${e.toString()}`)
        }
    }

    // 结束下载：status 为 success / fail / interrupted，finalUri 用于读取最终文件大小
    static async finishRecord(filename: string, status: DownloadRecordStatus, finalUri?: string): Promise<void> {
        let record: DownloadRecord | null = null
        for (let i = records.length - 1; i >= 0; i--) {
            if (records[i].filename === filename && records[i].status === "downloading") {
                record = records[i]
                break
            }
        }
        if (!record) return

        if (sampler && sampler.recordId === record.id) {
            stopSampler()
        }
        record.status = status
        record.endTime = Date.now()

        try {
            const info = await asyncFile.get({ uri: finalUri || `internal://files/${filename}` })
            if (info && info.length) {
                record.size = info.length
            }
        } catch (e) {
            // 文件不存在（失败/中断）时保留采样到的大小
        }

        // 全程无有效采样时回退为平均速度
        if (record.maxSpeed <= 0 && record.size > 0) {
            const elapsed = (record.endTime - record.startTime) / 1000
            if (elapsed > 0) {
                record.maxSpeed = Math.round(record.size / elapsed)
            }
        }

        await saveRecords()
    }

    static listRecords(): DownloadRecord[] {
        return [...records]
    }

    // 清空全部记录（清理"缓存内容"时调用）
    static async clearAll(): Promise<void> {
        stopSampler()
        records = []
        await saveRecords()
    }

    // 删除指定视频的记录（清理"视频音频"时调用）
    static async removeByBvids(bvids: string[]): Promise<void> {
        const set: Record<string, boolean> = {}
        for (const bvid of bvids) {
            if (bvid) set[bvid] = true
        }
        const before = records.length
        records = records.filter(r => !set[r.bvid])
        if (records.length !== before) {
            await saveRecords()
        }
    }
}
