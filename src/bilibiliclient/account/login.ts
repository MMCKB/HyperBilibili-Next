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
    // ignoreStored: 添加账号模式下传 true，跳过"本地已有账号"捷径强制走扫码流程
    // （否则已登录状态下加账号会立即命中本地账号"登录成功"，二维码页直接跳走）
    async login(this: any, send_req: boolean, interval: NodeJS.Timeout | null = null, ignoreStored: boolean = false): Promise<{ success: boolean, message: string }> {
        if (!ignoreStored) {
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

                return { success: true, message: "登录成功" };
            }
        }
        if (send_req) {
            const response = await this.getRequest(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${this.qrCodeKey}`);
            if (response && response.data && response.data.data.code === 0) {
                if (interval) clearInterval(interval);

                this.extractCookiesFromResponse(response.headers['Set-Cookie']);
                await this.storeAccountData();
                global.logger.log('使用二维码登录并存储账号数据成功');
                await this.updateAccountInfo();
                await this.updateBUVID();
                return { success: true, message: "登录成功" };
            } else {
                return { success: false, message: "等待用户操作..." };
            }
        }
    },

    // 退出登录（删除本地存储的账号数据）
    logOut(this: any) {
        storage.delete({ key: "bilibili_account" });
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
        const idx = accounts.findIndex(a => a.mid === entry.mid);
        if (idx >= 0) accounts[idx] = entry;
        else accounts.push(entry);
        await this.storeAccountsList(accounts);
    },

    // 从列表移除指定账号
    async removeAccountFromList(this: any, mid: string): Promise<void> {
        const accounts = await this.getStoredAccountsList();
        await this.storeAccountsList(accounts.filter(a => a.mid !== mid));
    },

    // 切换到列表中的指定账号：写回单账号存储并重载账号态
    async switchToAccount(this: any, mid: string): Promise<boolean> {
        const accounts = await this.getStoredAccountsList();
        const target = accounts.find(a => a.mid === mid);
        if (!target) return false;

        this.sessData = target.sessData;
        this.biliJct = target.biliJct;
        this.dedeUserID = target.dedeUserID;
        this.sid = target.sid;
        await this.storeAccountData();

        // 重载账号态（accountInfo / BUVID 都要按新账号刷新，不能沿用旧账号的）
        await this.updateAccountInfo();
        await this.updateBUVID();
        // 保存列表中该账号的显示信息
        await this.upsertCurrentAccountToList();
        return true;
    },

    // 登出：同时清掉列表里对应的账号
    async logOutWithList(this: any): Promise<void> {
        const mid = this.accountInfo ? this.accountInfo.mid : null;
        if (mid) await this.removeAccountFromList(String(mid));
        this.logOut();
    }
};