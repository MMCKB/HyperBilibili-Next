export const BilibiliClientUserMethods = {
    // 获取单个用户的信息
    async getUserInfoByUID(this: any, uid: String) {
        const url = `https://api.bilibili.com/x/space/wbi/acc/info`;
        const response = await this.getRequestWbi(url, {
            mid: uid
        });

        return response.data.data
    },

    // 获取单个用户的状态数
    async getUserStatByUID(this: any, uid: String) {
        const url = `https://api.bilibili.com/x/relation/stat`;
        const response = await this.getRequest(`${url}?vmid=${uid}`);

        return response.data.data
    },

    // 获取单个用户投稿的视频的代表作
    async getUserMasterPieceByUID(this: any, uid: String) {
        const url = `https://api.bilibili.com/x/space/masterpiece`;
        const response = await this.getRequest(`${url}?vmid=${uid}`);

        return response.data.data
    },

    // 获取用户投稿列表（分页）
    async getUserVideosByUID(this: any, uid: String, pn: Number, ps: Number = 5) {
        const url = `https://api.bilibili.com/x/space/wbi/arc/search`;
        const response = await this.getRequestWbi(url, {
            mid: uid,
            pn,
            ps
        });

        return response.data.data
    },

    // 获取用户空间动态列表
    async getUserDynamicListByUID(this: any, uid: String) {
        const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space`;
        const response = await this.getRequest(`${url}?host_mid=${uid}`);

        return response.data.data
    },

    // 获取单个用户的导航栏状态数
    async getUserNavnumByUID(this: any, uid: String) {
        const url = `https://api.bilibili.com/x/space/navnum`;
        const response = await this.getRequest(`${url}?mid=${uid}`);

        return response.data.data
    },

    // 获取单个用户的获赞数/播放数/阅读数
    async getUserUpstatByUID(this: any, uid: String) {
        const url = `https://api.bilibili.com/x/space/upstat`;
        const response = await this.getRequestWbi(url, {
            mid: uid
        });

        return response.data.data
    },

    // 获取用户关注列表（分页）
    async getFollowingsByUID(this: any, uid: String, pn: Number, ps: Number = 20) {
        const url = `https://api.bilibili.com/x/relation/followings`;
        const response = await this.getRequest(`${url}?vmid=${uid}&pn=${pn}&ps=${ps}&order=desc`);

        return response.data.data
    },

    // 获取用户粉丝列表（分页）
    async getFollowersByUID(this: any, uid: String, pn: Number, ps: Number = 20) {
        const url = `https://api.bilibili.com/x/relation/followers`;
        const response = await this.getRequest(`${url}?vmid=${uid}&pn=${pn}&ps=${ps}&order=desc`);

        return response.data.data
    },

    // 修改与用户的关系（关注/取消关注等）
    // act: 1=关注 2=取消关注 3=悄悄关注 4=取消悄悄关注 5=拉黑 6=取消拉黑
    async modifyRelation(this: any, uid: String, act: Number): Promise<any> {
        const url = `https://api.bilibili.com/x/relation/modify`;
        const body = `fid=${uid}&act=${act}&re_src=11&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    },

    // 查询当前登录用户与目标用户的关系
    // 返回 data.attribute: 0=未关注 2=已关注 6=互粉 128=已拉黑
    async getRelation(this: any, uid: String): Promise<any> {
        const url = `https://api.bilibili.com/x/relation?fid=${uid}`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 获取当前登录用户的导航栏信息（包含硬币余额 money）
    async getNavInfo(this: any): Promise<any> {
        const url = `https://api.bilibili.com/x/web-interface/nav`;
        const response = await this.getRequest(url);
        return response.data.data;
    },

    // 根据UID批量获取用户信息
    async getMultiUserInfoByUID(this: any, uids: Array<String>) {
        const url = "https://api.bilibili.com/x/polymer/pc-electron/v1/user/cards";
        let param = "";
        uids.forEach(uid => {
            if(uid.toString().length > 0){
                param += uid
                if (uids.indexOf(uid) != uids.length - 1) {
                    param += ","
                }
            }
        });
        const response = await this.getRequest(`${url}?uids=${param}`)

        return response.data.data
    }
}