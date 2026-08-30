import { storage, router } from '../../tsimports';
import { asyncFile } from '../../asyncapi/file';
import { AccountData } from './accountData';

// 账号状态文件镜像
// 部分设备上 storage 的写入在进程被杀时会丢（表现为"临退出前添加的账号重启后消失"）
// 文件写入已在本平台验证可跨重启持久（日志就是文件写入），作为 storage 的兜底
const ACCOUNT_STATE_FILE = 'internal://files/account_state.json';

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

            // 兼容旧版：单账号键
            // 仅在"从未用过新版多账号管理"（无文件镜像）时才作为恢复依据：
            // 退出登录时 storage.delete 在部分设备上会静默丢失，旧键会让已退出的账号"复活"
            const fileState = await this.readAccountFile();
            if (!fileState) {
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
                // 四处一致：单账号键 + 多账号列表 + 激活账号标记 + 文件镜像（重启后恢复到刚登录的账号）
                await this.commitCurrentAccount();
                return { success: true, message: "登录成功" };
            } else {
                return { success: false, message: "等待用户操作..." };
            }
        }
    },

    // 彻底登出：清内存登录态 + 单账号键 + 激活标记 + 空文件镜像
    // 内存不清的话，进程存活期间全局 client 仍带着旧 Cookie 发请求（表现为"点了退出还是登录态"）
    async logOut(this: any): Promise<void> {
        // 清内存中的登录态
        this.sessData = null;
        this.biliJct = null;
        this.dedeUserID = null;
        this.sid = null;
        this.accountInfo = null;

        // delete 在部分设备上不可靠：失败时写空值兜底，保证启动判断（jumpcheck）不会命中旧数据
        await new Promise<void>((resolve) => {
            storage.delete({
                key: "bilibili_account",
                success: () => resolve(),
                fail: (data: any, code: number) => {
                    global.logger.error(`删除账号数据失败，错误码 = ${code}，写入空值兜底`);
                    storage.set({
                        key: "bilibili_account",
                        value: "",
                        success: () => resolve(),
                        fail: () => resolve()
                    });
                }
            });
        });
        await new Promise<void>((resolve) => {
            storage.delete({
                key: "bilibili_active_mid",
                success: () => resolve(),
                fail: () => resolve()
            });
        });
        // 空文件镜像：login() 据此跳过旧版单账号键兼容路径，已退出的账号不会"复活"
        await this.persistAccountFile(null, []);
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
                    // 解析失败（数据损坏）返回 null；不 catch 的话 Promise 永远 pending，会卡死启动
                    try {
                        resolve(data ? JSON.parse(data) as AccountData : null);
                    } catch (e) {
                        global.logger.error('存储的账号数据解析失败，按无数据处理');
                        resolve(null);
                    }
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
                        global.logger.error(`存储账号数据失败，错误码 = ${code}`);
                        reject();
                    }
                });
            });
        } else {
            // 静默跳过会让单账号键保留旧账号的数据，重启后恢复到错误账号 —— 必须留痕
            global.logger.error('账号数据不完整（cookie 缺失），跳过单账号键写入');
            return Promise.resolve();
        }
    },

    // ==================== 多账号管理 ====================
    // 三层存储：
    // 1. bilibili_accounts（storage）—— 账号列表
    // 2. bilibili_active_mid（storage）—— 激活账号标记
    // 3. account_state.json（文件镜像）—— { activeMid, accounts } 全量状态
    // 部分设备 storage 写入会在进程被杀时丢失，文件镜像用于兜底恢复；
    // 读取时三层取并集自愈，写入时 commitCurrentAccount / 登出统一同步

    // 读取文件镜像（不存在返回 null，属首次使用的正常情况）
    async readAccountFile(this: any): Promise<{ activeMid: string | null, accounts: any[] } | null> {
        try {
            const text = await asyncFile.readText({ uri: ACCOUNT_STATE_FILE });
            if (!text) return null;
            const parsed = JSON.parse(text);
            if (!parsed || !Array.isArray(parsed.accounts)) return null;
            return { activeMid: parsed.activeMid || null, accounts: parsed.accounts };
        } catch (error) {
            return null;
        }
    },

    // 写入文件镜像（storage 丢失时的最后防线，失败仅记日志不阻断流程）
    async persistAccountFile(this: any, activeMid: string | null, accounts: any[]): Promise<void> {
        try {
            await asyncFile.writeText({
                uri: ACCOUNT_STATE_FILE,
                text: JSON.stringify({ activeMid: activeMid, accounts: accounts })
            });
            global.logger.log(`账号文件镜像已写入: ${accounts.length} 个账号, active=${activeMid}`);
        } catch (error) {
            global.logger.error(`账号文件镜像写入失败: ${error && error.toString ? error.toString() : error}`);
        }
    },

    // 获取已存的所有账号列表（登录态）：storage 与文件镜像取并集，任一层丢数据都能找回
    async getStoredAccountsList(this: any): Promise<any[]> {
        let stored: any[] = [];
        await new Promise<void>((resolve) => {
            storage.get({
                key: 'bilibili_accounts',
                success: (data: string) => {
                    // 解析失败按空列表处理，避免 Promise 永远 pending 卡死登录
                    try {
                        stored = data ? JSON.parse(data) : [];
                    } catch (e) {
                        global.logger.error('账号列表解析失败，按空列表处理');
                        stored = [];
                    }
                    resolve();
                },
                fail: () => resolve()
            });
        });
        if (!Array.isArray(stored)) stored = [];

        const fileState = await this.readAccountFile();
        if (!fileState || fileState.accounts.length === 0) return stored;

        // 并集合并：同 mid 以 storage 为准（会话内更新），文件独有的账号补回来
        const merged = stored.slice();
        let healed = 0;
        for (const fa of fileState.accounts) {
            if (!fa || fa.mid === undefined || fa.mid === null) continue;
            const idx = merged.findIndex(a => String(a.mid) === String(fa.mid));
            if (idx < 0) {
                merged.push(fa);
                healed++;
            }
        }
        if (healed > 0) {
            global.logger.log(`storage 账号列表不完整，从文件镜像找回 ${healed} 个账号`);
            // 回写 storage 修复，切换页等直接读 storage 的地方也能看到
            await this.storeAccountsList(merged);
        }
        return merged;
    },

    // 保存账号列表到 storage（文件镜像由 commitCurrentAccount / 登出统一同步）
    async storeAccountsList(this: any, accounts: any[]): Promise<void> {
        return new Promise((resolve) => {
            storage.set({
                key: 'bilibili_accounts',
                value: JSON.stringify(accounts),
                success: () => resolve(),
                fail: (data: any, code: number) => {
                    // 不吞错误码：storage 写失败是"重启丢账号"的头号嫌疑，必须留痕
                    global.logger.error(`账号列表存储失败，错误码 = ${code}`);
                    resolve();
                }
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

    // 当前激活账号 mid：多账号模式下重启恢复的依据
    // 文件镜像优先：本设备 storage 在进程被杀时不可靠（登出后 delete 丢失、残留旧 mid
    // 会让已退出的账号"复活"），文件写入已验证可靠。storage 仅在文件不存在时兜底
    async getActiveAccountMid(this: any): Promise<string | null> {
        const fileState = await this.readAccountFile();
        if (fileState) {
            // 文件存在即以文件为准（包括 activeMid 为 null = 已登出，同样以此为准）
            if (fileState.activeMid) {
                global.logger.log(`激活账号标记（文件镜像）: ${fileState.activeMid}`);
                return fileState.activeMid;
            }
            return null;
        }

        const stored: string | null = await new Promise((resolve) => {
            storage.get({
                key: 'bilibili_active_mid',
                success: (data: string) => resolve(data || null),
                fail: () => resolve(null)
            });
        });
        if (stored) {
            global.logger.log(`激活账号标记（storage，无文件镜像）: ${stored}`);
            return stored;
        }
        return null;
    },

    async setActiveAccountMid(this: any, mid: string): Promise<void> {
        return new Promise((resolve) => {
            storage.set({
                key: 'bilibili_active_mid',
                value: mid,
                success: () => resolve(),
                fail: (data: any, code: number) => {
                    global.logger.error(`激活账号标记存储失败，错误码 = ${code}`);
                    resolve();
                }
            });
        });
    },

    // 提交当前 client 上的账号：storage 三处（单账号键 + 列表 + 激活标记）+ 文件镜像
    // 登录成功 / 切换账号后调用，保证重启后恢复到正确的账号
    async commitCurrentAccount(this: any): Promise<void> {
        // 单账号键写失败不阻断：列表 + 激活标记 + 文件镜像才是多账号的恢复依据
        try {
            await this.storeAccountData();
        } catch (e) { /* 已在 storeAccountData 内记日志 */ }
        await this.upsertCurrentAccountToList();
        if (this.accountInfo && this.accountInfo.mid) {
            const activeMid = String(this.accountInfo.mid);
            await this.setActiveAccountMid(activeMid);
            // 文件镜像：与 storage 相同的全量状态，storage 被杀丢失时从这里恢复
            const accounts = await this.getStoredAccountsList();
            await this.persistAccountFile(activeMid, accounts);
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

    // 登出：从列表移除当前账号，并彻底登出（清内存 Cookie + 单账号键 + 激活标记）
    // 剩余账号保留在列表里（下次登录后可切换），但不自动登录 ——
    // 退出后自动登入另一个账号，用户看到的就是"退出没生效"
    async logOutWithList(this: any): Promise<void> {
        const mid = this.accountInfo ? this.accountInfo.mid : null;
        const accounts = await this.getStoredAccountsList();
        const remaining = mid ? accounts.filter(a => String(a.mid) !== String(mid)) : accounts;
        await this.storeAccountsList(remaining);
        await this.logOut();
        // 文件镜像：activeMid=null 是"已登出"的权威标记（storage delete 丢失时以此为准）
        await this.persistAccountFile(null, remaining);
    },

    // 启动跳转判定（splash 后 Jump 调用）：是否存在可恢复的登录态
    // 不能只看单账号键：登出后该键在部分设备上删除丢失，会把已退出的账号"复活"
    async hasRestorableAccount(this: any): Promise<boolean> {
        const fileState = await this.readAccountFile();
        if (fileState) {
            // 文件镜像存在：activeMid 为 null 即已登出，直接去登录页
            if (!fileState.activeMid) return false;
            const accounts = await this.getStoredAccountsList();
            return accounts.some((a: any) => String(a.mid) === String(fileState.activeMid));
        }

        // 无文件镜像：从未用过新版多账号管理（或文件损坏），退回 storage 判定
        const activeMid = await this.getActiveAccountMid();
        if (activeMid) {
            const accounts = await this.getStoredAccountsList();
            if (accounts.some((a: any) => String(a.mid) === String(activeMid))) return true;
        }
        // 旧版单账号键（会同时被 login() 的兼容路径恢复，判定需与其一致）
        const accountData = await this.getStoredAccountData();
        return !!(accountData && accountData.sessData);
    },
};