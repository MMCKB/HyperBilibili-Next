export const BilibiliClientDynamicMethods = {
    async getDynamicList(this: any, host_mid: number = 0, offset: number = 0): Promise<any>{
        let url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?platform=web`
        if (host_mid) url += `&host_mid=${host_mid}`;
        if (offset) url += `&offset=${offset}`;

        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 点赞/取消点赞动态
    // up: 1=点赞, 0=取消点赞
    // 接口: POST x/dynamic/feed/dyn/thumb, body为JSON, URL带csrf, 无需WBI签名
    async LikeDynamic(this: any, dyn_id_str: string, up: number) {
        const url = `https://api.bilibili.com/x/dynamic/feed/dyn/thumb?csrf=${this.biliJct}`;
        const body = JSON.stringify({
            dyn_id_str,
            up,
            spmid: "333.1368.0.0",
            from_spmid: ""
        });
        const response = await this.postRequest(url, body, "application/json");
        return response.data;
    },

    // 发布文字动态
    // text: 动态文字内容
    // 接口: POST x/dynamic/feed/create/dyn, body为JSON, URL带csrf
    async CreateTextDynamic(this: any, text: string): Promise<any> {
        const url = `https://api.bilibili.com/x/dynamic/feed/create/dyn?csrf=${this.biliJct}`;
        const body = JSON.stringify({
            dyn_req: {
                content: {
                    contents: [{ raw_text: text, type: 1, biz_id: "" }]
                },
                scene: 1,
                up_choose_comment: 0
            }
        });
        const response = await this.postRequest(url, body, "application/json");
        return response.data;
    },

    // 置顶/取消置顶动态
    // dyn_id_str: 动态ID
    // 接口: POST x/dynamic/feed/beam, body为JSON, URL带csrf
    async PinDynamic(this: any, dyn_id_str: string): Promise<any> {
        const url = `https://api.bilibili.com/x/dynamic/feed/beam?csrf=${this.biliJct}`;
        const body = JSON.stringify({
            dyn_id_str,
            spmid: "333.1368.0.0",
            from_spmid: ""
        });
        const response = await this.postRequest(url, body, "application/json");
        if (!response) throw new Error("请求失败，未收到响应");
        return response.data;
    },

    // 删除动态
    // dyn_id_str: 动态ID
    // 接口: POST x/dynamic/feed/remove/dyn, body为JSON, URL带csrf
    async DeleteDynamic(this: any, dyn_id_str: string): Promise<any> {
        const url = `https://api.bilibili.com/x/dynamic/feed/remove/dyn?csrf=${this.biliJct}`;
        const body = JSON.stringify({
            dyn_id_str,
            spmid: "333.1368.0.0",
            from_spmid: ""
        });
        const response = await this.postRequest(url, body, "application/json");
        if (!response) throw new Error("请求失败，未收到响应");
        return response.data;
    }
}