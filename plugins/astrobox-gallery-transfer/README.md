# 图库图片传输插件

这个 ABox 插件用于把电脑或手机中选择的一张图片传入 **HyperBili Next** 的“工具箱 → 图库”。插件以 ABox Interconnect 通道向包名 `com.mmckb.hyperbilibili` 的手表应用发送分片数据；图片只写入手表应用的私有图库目录，不会上传到网络。

## 使用方法

首先安装与当前应用版本相匹配的 `HyperBili Next` RPK，并在手表打开 **工具箱 → 图库**。图库顶部显示“已准备接收图片”后，保持该页面前台。

然后在 ABox 安装本插件。首次打开时，同意 **设备**、**Interconnect** 与 **接收 Interconnect 消息**权限。确认 ABox 已连接目标手表后，点击“选择图片并传输”，选取一张 JPG、JPEG、PNG、WEBP 或 GIF 图片。插件会在每个分片获得手表确认后继续发送，直至显示“图片已传入手表图库”。

| 约束 | 说明 |
|---|---|
| 单次传输 | 一张图片 |
| 支持格式 | JPG、JPEG、PNG、WEBP、GIF |
| 单张大小 | 不超过 2 MiB |
| 必要条件 | 手表图库页面保持打开、ABox 与手表保持连接 |

## 安装

构建后的 `dist/图库图片传输.abp` 可在 ABox 中作为插件安装。若需从源代码自行构建，请准备 Rust 稳定工具链和 `wasm32-wasip2` 目标，然后执行：

```bash
rustup target add wasm32-wasip2
python3 scripts/build_dist.py --release --package
```

## 传输安全与限制

该插件不保存账号、Cookie 或图片副本。选中的图片只在插件内存中暂存到该次传输完成或失败。传输过程中若手表离开图库页、连接中断或文件写入失败，插件会停止当前传输；请重新打开图库页后再次选择图片。

图片会占用手表应用私有存储空间。可在图库查看器中使用“删除”操作清理不需要的图片。协议细节见 [PROTOCOL.md](./PROTOCOL.md)，ABox 与 Vela 接口依据见 [SOURCES.md](./SOURCES.md)。
