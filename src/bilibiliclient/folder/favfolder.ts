export const BilibiliClientFavFolderMethods = {
    // 获取用户创建的所有收藏夹信息
    async getUserFavouriteFolders(this: any, mid: string, type: number = 0, rid: string = null): Promise<any> {
        let url = `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}&type=${type}`;
        if (rid) url += `&rid=${rid}`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 获取用户所有收藏夹及目标视频在各收藏夹中的收藏状态
    // 返回的每个 folder 对象中包含 fav_state 字段：0=未收藏, 1=已收藏
    async getUserFavouriteFoldersWithVideoState(this: any, mid: string, aid: string): Promise<any> {
        const url = `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}&type=2&rid=${aid}`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 获取目标收藏夹元数据
    async getFavouriteFolderMetadata(this: any, mlid: string): Promise<any> {
        const url = `https://api.bilibili.com/x/v3/fav/folder/info?media_id=${mlid}`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 获取目标收藏夹内容
    async getFavouriteFolderContent(this: any, mlid: string, pn: number, ps: number = 10, keyword: string = null): Promise<any> {
        let url = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mlid}&ps=${ps}&pn=${pn}`;
        if (keyword) url += `&keyword=${keyword}`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 新建收藏夹
    // title: 标题  intro: 简介  privacy: 0公开 10私密
    async createFavFolder(this: any, title: string, intro: string = "", privacy: number = 0): Promise<any> {
        const url = `https://api.bilibili.com/x/v3/fav/folder/add`;
        const body = `title=${encodeURIComponent(title)}&intro=${encodeURIComponent(intro)}&privacy=${privacy}&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    },

    // 编辑收藏夹（重命名/改简介/改隐私）
    async editFavFolder(this: any, mediaId: string, title: string, intro: string = "", privacy: number = 0): Promise<any> {
        const url = `https://api.bilibili.com/x/v3/fav/folder/edit`;
        const body = `media_id=${mediaId}&title=${encodeURIComponent(title)}&intro=${encodeURIComponent(intro)}&privacy=${privacy}&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    },

    // 删除收藏夹
    async deleteFavFolder(this: any, mediaIds: string): Promise<any> {
        const url = `https://api.bilibili.com/x/v3/fav/folder/del`;
        const body = `media_ids=${mediaIds}&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    }
}