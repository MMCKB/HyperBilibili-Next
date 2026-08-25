# 图库图片传输的协议依据

本插件与手表图库采用 ABox 的 Interconnect 主机 API。该 API 允许插件按设备地址和快应用包名向穿戴设备发送字符串消息；要接收回包，插件需为相同的“设备地址 + 包名”组合注册 `register-interconnect-recv`。[1]

插件使用 ABox `dialog.pick-file` 选择单张本机图片。官方文档说明，设置 `read = true` 时宿主会将所选文件的字节数据返回给插件；当前多选接口仍只返回第一项，因此本插件一次传输一张图片。[2]

手表端使用 Xiaomi Vela `system.interconnect`：通过单例连接对象设置 `onmessage` 接收手机/桥端数据，并用 `send` 发送 JSON 回执。Vela 文档将其定义为与搭配使用的手机 App 收发数据的接口。[3]

图片使用应用私有目录保存，插件将图片切成小分片，以 Base64 放入 JSON 字符串。每个分片必须等待手表的确认回执后再继续下一片，避免一次向手表注入过大的消息或占用过多内存。

## References

[1] https://abox.run/docs/plugin-dev （ABox 插件开发概览）与 https://github.com/AstralSightStudios/AstroBox-NG-Plugin-Docs-Content/blob/main/content/docs/plugin-dev/host-api/interconnect.md （Interconnect 主机 API）

[2] https://github.com/AstralSightStudios/AstroBox-NG-Plugin-Docs-Content/blob/main/content/docs/plugin-dev/host-api/dialog.md （文件选择与对话框主机 API）

[3] https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html （Xiaomi Vela `system.interconnect` 文档）
