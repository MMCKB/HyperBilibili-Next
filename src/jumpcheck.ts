import { router, network } from './tsimports';

export async function Jump() {
    // 判定交给 biliclient 的权威账号状态（文件镜像优先）：
    // 之前直接读单账号键，退出后该键在部分设备上删除丢失，
    // 启动会带着残留旧键进 prepage → 主页匿名态，看起来"退出没生效"
    let hasAccount = false;
    try {
        hasAccount = await global.biliclient.hasRestorableAccount();
    } catch (e) {
        // 判定异常按未登录处理（登录页可自恢复），宁可重登不可错登
        global.logger.error(`启动登录态判定失败: ${e && e.toString ? e.toString() : e}`);
        hasAccount = false;
    }
    router.replace({
        uri: hasAccount ? "pages/app/entry/prepage" : "pages/app/entry/login"
    })
}

export async function NetworkCheck(): Promise<boolean> {
    return new Promise((resolve) => {
        network.getType({
            success: function (data: { type: string }) {
                if (!data.type) {
                    global.logger.log('Network type is empty or undefined.');
                    resolve(false);
                } else if (data.type === 'none') {
                    resolve(false);
                } else {
                    resolve(true);
                }
            },
            fail: function () {
                global.logger.log('Failed to get network type.');
                resolve(false);
            },
            complete: function () {
                global.logger.log('Network type check completed.');
            }
        });
    });
}