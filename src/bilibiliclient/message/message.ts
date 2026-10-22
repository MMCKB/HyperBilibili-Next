export const BilibiliClientMessageMethods = {
    // 获取通知信息数量 （例如回复我的、at我的、点赞数量）
    async getMessageNotifyFeed(this: any) {
        const url = "https://api.vc.bilibili.com/x/im/web/msgfeed/unread";
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 获取"回复我的"消息列表
    async getReplyFeed(this: any, pn: number = 1, ps: number = 20) {
        const url = "https://api.bilibili.com/x/msgfeed/reply";
        const response = await this.getRequestWbi(url, {
            pn,
            ps,
            build: 0,
            mobi_app: "web"
        });
        return response.data.data;
    },

    // 获取"收到的赞"消息列表
    // like 接口用 cursor 分页，首次请求无需 pn/ps
    async getLikeFeed(this: any) {
        const url = "https://api.bilibili.com/x/msgfeed/like";
        const response = await this.getRequestWbi(url, {
            build: 0,
            mobi_app: "web",
            platform: "web"
        });
        return response.data.data;
    },

    // 获取"@我的"消息列表
    async getAtFeed(this: any, pn: number = 1, ps: number = 20) {
        const url = "https://api.bilibili.com/x/msgfeed/at";
        const response = await this.getRequestWbi(url, {
            pn,
            ps,
            build: 0,
            mobi_app: "web"
        });
        return response.data.data;
    },

    // 获取"系统通知"消息列表
    // 抓包接口：message.bilibili.com/x/sys-msg/query_unified_notify
    // 不需要 WBI 签名，返回 data.system_notify_list
    async getSysMsgFeed(this: any) {
        const url = "https://message.bilibili.com/x/sys-msg/query_unified_notify?page_size=20&build=0&mobi_app=web";
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 获取私信Session列表
    // 一次性最多拉取20个，可加end_ts做IFS（但没必要）
    async getDMSessions(this: any, session_type: number, sort_rule: number) {
        const url = "https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions"
        const response = await this.getRequestWbi(url, {
            session_type,
            sort_rule,
            group_fold: 0,
            unfollow_fold: 0,
            mobi_app: "web"
        })

        return response.data.data
    },

    // 获取私信Session聊天记录
    // 若要做IFS，则end_seqno应该为最顶上那条信息的序列号
    // 接口有漏洞，自带防撤回
    async getDMSessionMessage(this: any, session_type: number, talker_id: string, size: number = 10, end_seqno: string) {
        const url = "https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs"
        var params = {
            session_type,
            talker_id,
            size
        };
        if (end_seqno) {
            params["end_seqno"] = end_seqno;
        }
        const response = await this.getRequestWbi(url, params);

        return response.data.data
    },

    // 发送私信消息
    // 使用 svr_sync 通用端接口（app 端同款，无需 WBI 签名，风控宽松）。
    // 原先的 web_im/v1/web_im/send_msg 是 web 端专用接口，需要 web 端 buvid 指纹匹配，
    // 在手表环境下 fetch 会被取消（Vela code 1002 "is cancelled"）
    async SendDMSessionMessage(this: any, receiver_id: string, msg_type: number, content: string) {
        const url = "https://api.vc.bilibili.com/svr_sync/v1/svr_sync/send_msg";
        const body = `msg[sender_uid]=${this.accountInfo.mid}&msg[receiver_id]=${receiver_id}&msg[receiver_type]=1&msg[msg_type]=${msg_type}&msg[dev_id]=${this.dm_deviceid}&msg[timestamp]=${Number.parseInt(((new Date()).getTime() / 1000).toString())}&msg[content]=${encodeURIComponent(JSON.stringify({"content": `${content}`}))}&msg[msg_status]=0&msg[new_face_version]=0&csrf=${this.biliJct}&csrf_token=${this.biliJct}`;

        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");

        // 网络层失败时 postRequest 返回 undefined：
        // 返回可被调用方识别的失败响应，而不是让其读 .code 时抛 TypeError
        if (!response) {
            return { code: -1, message: "网络请求失败" }
        }
        // 返回完整响应体（含 code/message），调用方按 result.code 判断发送结果
        return response
    },

    // 发送视频卡片私信（B站手机端"分享到私信"同款：msg_type=10 分享卡片，
    // 接收方B站客户端显示可点击的视频卡片）
    // 注意卡片消息的 content 为裸视频信息 JSON，不能按文本消息再包一层 {"content": ...}
    async SendDMVideoCard(this: any, receiver_id: string, bvid: string, aid: number, cid: number, title: string, cover: string, duration: number) {
        const url = "https://api.vc.bilibili.com/svr_sync/v1/svr_sync/send_msg";
        const card = {
            content: bvid,
            media_type: 2,
            bvid: bvid,
            aid: aid,
            cid: cid,
            duration: duration,
            cover_url: cover,
            jump_url: "//www.bilibili.com/video/" + bvid,
            jump_text: "哔哩哔哩",
            title: title,
            play_count: 0,
            danmaku_count: 0
        }
        const body = `msg[sender_uid]=${this.accountInfo.mid}&msg[receiver_id]=${receiver_id}&msg[receiver_type]=1&msg[msg_type]=10&msg[dev_id]=${this.dm_deviceid}&msg[timestamp]=${Number.parseInt(((new Date()).getTime() / 1000).toString())}&msg[content]=${encodeURIComponent(JSON.stringify(card))}&msg[msg_status]=0&msg[new_face_version]=0&csrf=${this.biliJct}&csrf_token=${this.biliJct}`;

        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");

        if (!response) {
            return { code: -1, message: "网络请求失败" }
        }
        return response
    },
};