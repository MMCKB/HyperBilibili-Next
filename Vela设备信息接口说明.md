# Xiaomi Vela 快应用：可获取的设备当前信息

本文基于 Xiaomi Vela JS App 官方接口文档整理，并区分了两层含义：**`@system.device` 设备模块本身的固定信息**，以及**网络、电池、传感器等可反映设备当前状态的独立系统模块**。

> 如果问题特指 `device.getInfo()`，当前官方文档列出 **17 项**返回字段；若加上设备标识、序列号、存储、网络、电池和传感器，则可以获取更多设备状态，但具体支持情况随设备型号、系统 API 版本和权限而变化。[1] [2] [3] [4]

## 1. `device.getInfo()`：17 项基础设备与系统信息

| 类别 | 字段 | 含义 |
|---|---|---|
| 品牌与型号 | `brand`、`manufacturer`、`model`、`product` | 品牌、制造商、型号、产品代号 |
| 系统 | `osType`、`osVersionName`、`osVersionCode` | 操作系统名称与版本 |
| 运行时 | `platformVersionName`、`platformVersionCode`、`APILevel` | Vela 运行时平台版本与框架 API 等级 |
| 本地化 | `language`、`region` | 系统语言与地区 |
| 屏幕 | `screenWidth`、`screenHeight`、`screenDensity`、`screenShape` | 逻辑宽高、DPR、屏幕形状（矩形/圆形/胶囊形） |
| 产品类别 | `deviceType` | 设备类型：`watch`、`band` 或 `smartspeaker` |

其中 `APILevel`、`deviceType` 从 API Level 2 起可用；`screenDensity` 和胶囊屏形状从 API Level 3 起可用。项目当前已在 `app.ux` 中调用 `getDeviceInformation()` 并保存为 `global.DEVICE_INFO`，视频卡片也使用其中的 `screenShape` 和 `screenWidth` 做布局适配。[1] [5] [6]

## 2. `@system.device` 的其他接口

| 接口 | 返回信息 | 权限或限制 |
|---|---|---|
| `device.getDeviceId()` | `deviceId`，设备唯一标识符 | 需在 `manifest.json` 配置 `hapjs.permission.DEVICE_INFO` |
| `device.getSerial()` | `serial`，设备序列号 | 同样需要 `hapjs.permission.DEVICE_INFO`；应视为敏感标识，不应随意上传或记录 |
| `device.getTotalStorage()` | `totalStorage`，总存储空间，单位字节 | 无特殊权限说明 |
| `device.getAvailableStorage()` | `availableStorage`，可用存储空间，单位字节 | 无特殊权限说明 |

当前项目已封装 `getDeviceSerial()`；序列号读取失败时会跳往权限错误页，因此已有设备信息权限处理链路。[1] [6]

## 3. 可反映“当前状态”的独立系统模块

### 网络状态：`@system.network`

`network.getType()` 可返回当前网络类型：`2g`、`3g`、`4g`、`5g`、`wifi`、`bluetooth`、`none`、`others`；`network.subscribe()` 可监听网络类型变化。官方特别提示：类型不为 `none` 不等于一定能访问目标服务器，实际可用性仍要用请求结果判断。[2]

项目当前在启动时调用 `getNetworkType()`，并保存为 `global.DEVICE_NETWORK_TYPE`。[6]

### 电池状态：`@system.battery`

`battery.getStatus()` 的接口定义包含 `charging`（是否正在充电）和 `level`（当前电量，0.0–1.0）。但该接口并非所有设备支持，且实际支持度可能细化到字段级别：**o65/REDMI Watch 5 eSIM 的实机反馈显示可以读取 `level` 电量，但无法可靠获取 `charging` 充电状态。** 因此不要仅依赖型号白名单；应分别检测字段是否存在，并在 `charging` 缺失时只展示电量，避免推断充电状态。官方兼容表也未对 eSIM 变体单独列项。[3]

### 传感器：`@system.sensor`

| 接口 | 可获得的实时数据 | 备注 |
|---|---|---|
| `subscribePressure()` | `pressure`，气压，单位 hPa | 回调订阅；仅部分设备支持 |
| `subscribeAccelerometer()` | `x`、`y`、`z` 三轴加速度/重力数据 | 回调频率可选 `game`（约 20 ms）、`ui`（约 60 ms）、`normal`（约 200 ms） |
| `subscribeCompass()` | `direction`（相对磁北角度）、`accuracy` | 不支持时可能返回错误码 `1000` |

这三类接口都必须在页面离开时调用相应 `unsubscribe...()`，避免后台继续耗电和触发回调。官方兼容表明确指出，各传感器的支持设备并不一致。[4]

## 4. 对本项目的实际建议

对于 HyperBilibili-Next，优先使用 `screenShape`、`screenWidth`、`screenDensity` 和 `deviceType` 做布局及动画降级；网络类型用于决定图片清晰度、请求重试与缓存策略；存储总量/可用量用于下载前容量提示。电池和传感器不适合作为普通视频客户端的默认依赖，应只在有明确功能价值时按需调用，并做好不支持设备的降级。若展示电量，o65/REDMI Watch 5 eSIM 应只读取 `level`；`charging` 缺失时不展示“正在充电/未充电”的判断。

不要将 `deviceId` 或 `serial` 上传到业务服务、日志或公开页面；如确需作为本地设备标识使用，应在隐私声明、权限请求与数据最小化方面单独设计。

## 参考资料

[1]: https://iot.mi.com/vela/quickapp/en/features/basic/device.html "Xiaomi Vela JS App：Device Information"
[2]: https://iot.mi.com/vela/quickapp/en/features/system/network.html "Xiaomi Vela JS App：Network Information"
[3]: https://iot.mi.com/vela/quickapp/en/features/system/battery.html "Xiaomi Vela JS App：Power Information"
[4]: https://iot.mi.com/vela/quickapp/en/features/system/sensor.html "Xiaomi Vela JS App：Sensor"
[5]: https://github.com/MMCKB/HyperBilibili-Next/blob/Next-main/src/app.ux "项目应用入口"
[6]: https://github.com/MMCKB/HyperBilibili-Next/blob/Next-main/src/tools.ts "项目设备信息封装"
