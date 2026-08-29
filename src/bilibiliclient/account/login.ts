import { storage, router } from '../../tsimports';
import { AccountData } from './accountData';

// 登录相关的方法
export const BilibiliClientLoginMethods = {
    // 更新账号信息
    async updateAccountInfo(this: any): Promise<boolean> {
        const accountInfoResponse = await this.getRequest("https://api.bilibili.com/x/web-interface/nav");

        if(!accountInfoResponse.data.data.isLogin){
            router.clear();
            router.replace({
                uri: "pages/error/sessionood"
            })
        }

        this.accountInfo = accountInfoResponse.data.data;
        return !!this.accountInfo;
    },

    // 刷新BUVID
    async updateBUVID(this: any) {
        const response = await this.getRequest("https://api.bilibili.com/x/frontend/finger/spi");
        this.buvid3 = response.data.data.b_3;
        this.buvid4 = response.data.data.b_4;
    },

    // 获取二维码信息
    async loginQR(this: any): Promise<{ url: string, qrcode_key: string }> {
        global.logger.log("请求登录二维码");
        const response = await this.getRequest('https://passport.bilibili.com/x/passport-login/web/qrcode/generate');
        if (response && response.data) {
            this.qrCodeKey = response.data.data.qrcode_key;
            return { url: response.data.data.url, qrcode_key: response.data.data.qrcode_key };
        } else {
            throw new Error('获取二维码失败');
        }
    },

    // 登录函数，使用本地存储的账号数据或通过二维码登录
    // ignoreStored: 二维码登录页传 true 跳过"本地已有账号"捷径强制走扫码流程
    // （已登录状态下加账号、或残留激活标记时，否则会立即命中"登录成功"，二维码页直接跳走）
    async login(this: any, send_req: boolean, interval: NodeJS.Timeout | null = null, ignoreStored: boolean = false): Promise<{ success: boolean, message: string }> {
        if (!ignoreStored) {
            // 多账号：优先按"激活账号 mid"从账号列表恢复（上次使用的账号）
            // 单账号键在添加账号时会被新账号覆盖，重启恢复不能只依赖它
            const accounts = await this.getStoredAccountsList();
            const activeMid = await this.getActiveAccountMid();
            const active = activeMid ? accounts.find((a: any) => String(a.mid) === String(activeMid)) : null;
            if (active) {
                this.sessData = active.sessData;
                this.biliJct = active.biliJct;
                this.dedeUserID = active.dedeUserID;
                this.sid = active.sid;
                global.logger.log(`使用激活账号(mid=${activeMid})登录成功`);
                await this.updateAccountInfo();
                await this.updateBUVID();
                return { success: true, message: "登录成功" };
            }

            // 兼容旧版：单账号键（旧版本登录的账号不在多账号列表里）
            const accountData = await this.getStoredAccountData();
            if (accountData) {
                this.sessData = accountData.sessData;
                this.biliJct = accountData.biliJct;
                this.dedeUserID = accountData.dedeUserID;
                this.sid = accountData.sid;
                global.logger.log('使用存储的账号数据登录成功');
                global.logger.log('拉账号信息')
                await this.updateAccountInfo();
                global.logger.log('拉buvid')
                await this.updateBUVID();
                // 迁移：旧账号也写进多账号列表并打上激活标记
                // 否则下次"添加账号"时会被新账号顶掉丢失
                await this.commitCurrentAccount();

                return { success: true, message: "登录成功" };
            }
        }
        if (send_req) {
            const response = await this.getRequest(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${this.qrCodeKey}`);
            if (response && response.data && response.data.data.code === 0) {
                if (interval) clearInterval(interval);

                // 添加账号：新账号马上会覆盖 client 上的 cookies 和单账号键
                // 先把当前登录的原账号写入多账号列表，防止它被新账号顶掉后彻底丢失
                // 必须放在 extractCookies 之前 —— 那时 client 上还是原账号的数据
                if (this.accountInfo && this.accountInfo.mid) {
                    await this.upsertCurrentAccountToList();
                }

                this.extractCookiesFromResponse(response.headers['Set-Cookie']);
                global.logger.log('使用二维码登录成功');
                await this.updateAccountInfo();
                await this.updateBUVID();
                // 三处一致：单账号键 + 多账号列表 + 激活账号标记（重启后恢复到刚登录的账号）
                await this.commitCurrentAccount();
                return { success: true, message: "登录成功" };
            } else {
                return { success: false, message: "等待用户操作..." };
            }
        }
    },

    // 退出登录（清空单账号键与激活标记；多账号列表是否移除对应项由调用方决定）
    logOut(this: any) {
        storage.delete({ key: "bilibili_account" });
        storage.delete({ key: "bilibili_active_mid" });
    },

    // 从响应头中提取Cookies
    extractCookiesFromResponse(this: any, setCookieHeaders: string | string[]) {
        if (typeof setCookieHeaders === 'string') {
            setCookieHeaders = setCookieHeaders.split(', ');
        }

        setCookieHeaders.forEach(cookie => {
            if (cookie.includes('SESSDATA')) this.sessData = this.parseCookie(cookie, 'SESSDATA');
            else if (cookie.includes('bili_jct')) this.biliJct = this.parseCookie(cookie, 'bili_jct');
            else if (cookie.includes('DedeUserID') && !cookie.includes('DedeUserID__ckMd5')) this.dedeUserID = this.parseCookie(cookie, 'DedeUserID');
            else if (cookie.includes('sid')) this.sid = this.parseCookie(cookie, 'sid');
        });
    },

    // 辅助函数，用于解析cookie字符串
    parseCookie(this: any, cookie: string, name: string): string | null {
        const match = cookie.match(new RegExp(`${name}=([^;]+)`));
        return match ? match[1] : null;
    },

    // 获取本地存储的账号数据
    async getStoredAccountData(this: any): Promise<AccountData | null> {
        return new Promise((resolve) => {
            storage.get({
                key: 'bilibili_account',
                success: (data: string) => {
                    resolve(data ? JSON.parse(data) as AccountData : null);
                },
                fail: (data: any, code: number) => {
                    global.logger.log(`获取存储的账号数据失败，错误码 = ${code}`);
                    resolve(null);
                }
            });
        });
    },

    // 保存账号数据到本地存储
    async storeAccountData(this: any): Promise<void> {
        if (this.sessData && this.biliJct && this.dedeUserID && this.sid) {
            const accountData: AccountData = { sessData: this.sessData, biliJct: this.biliJct, dedeUserID: this.dedeUserID, sid: this.sid };
            return new Promise((resolve, reject) => {
                storage.set({
                    key: 'bilibili_account',
                    value: JSON.stringify(accountData),
                    success: () => {
                        global.logger.log('账号数据存储成功');
                        resolve();
                    },
                    fail: (data: any, code: number) => {
                        global.logger.log(`存储账号数据失败，错误码 = ${code}`);
                        reject();
                    }
                });
            });
        }
    },

    // ==================== 多账号管理 ====================
    // 存储结构：key = bilibili_accounts，value = JSON 数组（每项含 AccountData + 显示信息）
    // 当前账号仍用 bilibili_account 存（保持单账号逻辑兼容）

    // 获取已存的所有账号列表（登录态）
    async getStoredAccountsList(this: any): Promise<any[]> {
        return new Promise((resolve) => {
            storage.get({
                key: 'bilibili_accounts',
                success: (data: string) => {
                    resolve(data ? JSON.parse(data) : []);
                },
                fail: () => resolve([])
            });
        });
    },

    // 保存账号列表
    async storeAccountsList(this: any, accounts: any[]): Promise<void> {
        return new Promise((resolve) => {
            storage.set({
                key: 'bilibili_accounts',
                value: JSON.stringify(accounts),
                success: () => resolve(),
                fail: () => resolve()
            });
        });
    },

    // 把当前登录的账号加入列表（已存在同 mid 则更新；登录后调用）
    async upsertCurrentAccountToList(this: any): Promise<void> {
        if (!this.accountInfo || !this.accountInfo.mid) return;
        const accounts = await this.getStoredAccountsList();
        const entry = {
            sessData: this.sessData,
            biliJct: this.biliJct,
            dedeUserID: this.dedeUserID,
            sid: this.sid,
            mid: this.accountInfo.mid,
            uname: this.accountInfo.uname || "",
            face: this.accountInfo.face || ""
        };
        // mid 来源不同可能是数字或字符串，统一转字符串比较（与 switchToAccount 一致）
        const idx = accounts.findIndex(a => String(a.mid) === String(entry.mid));
        if (idx >= 0) accounts[idx] = entry;
        else accounts.push(entry);
        await this.storeAccountsList(accounts);
    },

    // 从列表移除指定账号
    async removeAccountFromList(this: any, mid: string): Promise<void> {
        const accounts = await this.getStoredAccountsList();
        await this.storeAccountsList(accounts.filter(a => String(a.mid) !== String(mid)));
    },

    // 当前激活账号 mid：多账号模式下重启恢复的依据
    async getActiveAccountMid(this: any): Promise<string | null> {
        return new Promise((resolve) => {
            storage.get({
                key: 'bilibili_active_mid',
                success: (data: string) => resolve(data || null),
                fail: () => resolve(null)
            });
        });
    },

    async setActiveAccountMid(this: any, mid: string): Promise<void> {
        return new Promise((resolve) => {
            storage.set({
                key: 'bilibili_active_mid',
                value: mid,
                success: () => resolve(),
                fail: () => resolve()
            });
        });
    },

    // 提交当前 client 上的账号：单账号键（兼容）+ 多账号列表 + 激活账号标记三处一致
    // 登录成功 / 切换账号后调用，保证重启后恢复到正确的账号
    async commitCurrentAccount(this: any): Promise<void> {
        await this.storeAccountData();
        await this.upsertCurrentAccountToList();
        if (this.accountInfo && this.accountInfo.mid) {
            await this.setActiveAccountMid(String(this.accountInfo.mid));
        }
    },

    // 切换到列表中的指定账号：写回单账号存储并重载账号态
    async switchToAccount(this: any, mid: string): Promise<boolean> {
        const accounts = await this.getStoredAccountsList();
        // mid 可能是数字或字符串（列表来源不同），统一转字符串比较
        const target = accounts.find(a => String(a.mid) === String(mid));
        if (!target) return false;

        this.sessData = target.sessData;
        this.biliJct = target.biliJct;
        this.dedeUserID = target.dedeUserID;
        this.sid = target.sid;

        // 重载账号态（accountInfo / BUVID 都要按新账号刷新，不能沿用旧账号的）
        await this.updateAccountInfo();
        await this.updateBUVID();
        // 三处存储一致：单账号键 + 列表显示信息 + 激活账号标记（重启后按此恢复）
        await this.commitCurrentAccount();
        return true;
    },

    // 登出：同时清掉列表里对应的账号（logOut 已负责清单账号键和激活标记）
    async logOutWithList(this: any): Promise<void> {
        const mid = this.accountInfo ? this.accountInfo.mid : null;
        if (mid) await this.removeAccountFromList(String(mid));
        this.logOut();
    }
};