import { storage, router, network } from './tsimports';

export async function Jump() {
    storage.get({
        key: "bilibili_account",
        success: async (bilibili_account) => {
            if (!bilibili_account || bilibili_account.length < 1) {
                router.replace({
                    uri: "pages/app/entry/login"
                })
            } else {
                router.replace({
                    uri: "pages/app/entry/prepage"
                })
            }
        },
        // 键不存在（登出后被删除）时部分引擎走 fail 而不是 success：
        // 不处理的话会卡在启动页，表现为"点了退出没反应"
        fail: () => {
            router.replace({
                uri: "pages/app/entry/login"
            })
        }
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