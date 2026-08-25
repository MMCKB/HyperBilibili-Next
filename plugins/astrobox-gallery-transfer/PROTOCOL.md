# 图库图片传输协议 v1

本协议仅用于 `com.mmckb.hyperbilibili` 的工具箱图库功能。ABox 插件与手表通过 Interconnect 发送 UTF-8 JSON 字符串；图片二进制仅以 Base64 放在 `gallery-chunk.data` 字段中。

> 手表必须先打开“工具箱 → 图库”页面，确保页面已监听 Interconnect 消息；插件随后选择并传输一张图片。

## 容量与分片

| 项目 | 约束 |
|---|---:|
| 单次传输 | 仅一张图片 |
| 支持格式 | JPG、JPEG、PNG、WEBP、GIF |
| 源文件上限 | 2 MiB |
| 原始分片大小 | 2,048 字节 |
| 流控方式 | 每一片均等待手表确认后再发下一片 |

## 消息顺序

```text
手表 gallery-handshake ───────────────► 插件（可选，用于提示接收已就绪）
插件 gallery-begin ───────────────────► 手表
手表 gallery-ready ───────────────────► 插件
插件 gallery-chunk(index=0) ──────────► 手表
手表 gallery-ack(index=0) ────────────► 插件
插件 gallery-chunk(index=1) ──────────► 手表
…
插件 gallery-end ─────────────────────► 手表
手表 gallery-complete ────────────────► 插件
```

任一侧出现错误时，手表发送 `gallery-error`；插件停止该次传输，手表会删除未完成的本机临时文件。

## 消息结构

### `gallery-begin`

```json
{
  "tag": "gallery-begin",
  "id": "gallery-1",
  "name": "photo.jpg",
  "mime": "image/jpeg",
  "totalBytes": 123456,
  "totalChunks": 61
}
```

### `gallery-chunk`

```json
{
  "tag": "gallery-chunk",
  "id": "gallery-1",
  "index": 0,
  "total": 61,
  "data": "<Base64 编码的原始图片分片>"
}
```

### 确认与结束

```json
{ "tag": "gallery-ready", "id": "gallery-1" }
{ "tag": "gallery-ack", "id": "gallery-1", "index": 0 }
{ "tag": "gallery-end", "id": "gallery-1" }
{ "tag": "gallery-complete", "id": "gallery-1" }
{ "tag": "gallery-error", "id": "gallery-1", "reason": "chunk-failed" }
```
