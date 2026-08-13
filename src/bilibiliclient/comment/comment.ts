export const BilibiliClientCommentMethods = {
    // 获取评论区内容
    async getReplies(this: any, type: string, oid: string, pn: number = 1, ps: number = 10, sort: number = 1) {
        const url = `https://api.bilibili.com/x/v2/reply?type=${type}&oid=${oid}&pn=${pn}&ps=${ps}&sort=${sort}`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 获取二级评论区内容
    async getSecReplies(this: any, type: string, oid: string, root: string, pn: number = 1, ps: number = 10) {
        const url = `https://api.bilibili.com/x/v2/reply/reply?type=${type}&oid=${oid}&pn=${pn}&ps=${ps}&root=${root}`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 点赞评论
    async LikeReply(this: any, type: string, oid: string, rpid: string, action: number) {
        const url = "https://api.bilibili.com/x/v2/reply/action";
        const body = `type=${type}&oid=${oid}&rpid=${rpid}&action=${action}&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    },

    // 发送评论
    async GiveReply(this: any, type: string, oid: string, message: string) {
        const url = "https://api.bilibili.com/x/v2/reply/add";
        // message 必须URL编码，否则中文/特殊字符会导致B站接口返回-400
        const body = `type=${type}&oid=${oid}&message=${encodeURIComponent(message)}&plat=1&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    },

    // 回复评论（发送二级评论）
    // 回复一级评论时，root 与 parent 均为被回复评论的 rpid
    async GiveSecReply(this: any, type: string, oid: string, parent: string, message: string) {
        const url = "https://api.bilibili.com/x/v2/reply/add";
        const body = `type=${type}&oid=${oid}&parent=${parent}&root=${parent}&message=${encodeURIComponent(message)}&plat=1&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    },

    // 回复二级评论（对话树）
    // dialog 为被回复评论的 dialog 字段，B站要求回复二级评论时必须传入，否则返回 -400
    async GiveTreeReply(this: any, type: string, oid: string, parent: string, root: string, dialog: string, message: string) {
        const url = "https://api.bilibili.com/x/v2/reply/add";
        const body = `type=${type}&oid=${oid}&parent=${parent}&root=${root}&dialog=${dialog}&message=${encodeURIComponent(message)}&plat=1&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    },
};