export const BilibiliClientHistoryMethods = {
    // 获取历史记录
    async getWatchHistory(this: any, pn: number, ps: number): Promise<any> {
        const url = `https://api.bilibili.com/x/v2/history?pn=${pn}&ps=${ps}`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 获取稍后再看列表
    async getWatchLaterList(this: any): Promise<any> {
        const url = `https://api.bilibili.com/x/v2/history/toview`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 添加视频到稍后再看
    async addToWatchLater(this: any, bvid: string): Promise<any> {
        const url = `https://api.bilibili.com/x/v2/history/toview/add`;
        const body = `bvid=${bvid}&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    },

    // 从稍后再看删除单个视频
    async removeFromWatchLater(this: any, aid: string): Promise<any> {
        const url = `https://api.bilibili.com/x/v2/history/toview/del`;
        const body = `aid=${aid}&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    },

    // 清空稍后再看列表
    async clearWatchLater(this: any): Promise<any> {
        const url = `https://api.bilibili.com/x/v2/history/toview/clear`;
        const body = `csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    }
}