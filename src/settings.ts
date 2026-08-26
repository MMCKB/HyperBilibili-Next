import { storage } from "./tsimports"

interface SettingsInterface {
  fresh_type: number; //视频推荐相关度，范围1-3，根据大数据推送
  home_vid_count: number;
  // 搜索结果视频显示数量，范围1-20
  search_vid_count: number;
  // 专栏articleshow的每页dom节点裁切数量（单页最大dom数）
  article_split_dom_count: number;
  enableFullAnimation: boolean;
  // 是否在评论区加载并显示图片（会影响低性能设备流畅度）
  enableCommentPictures: boolean;
  startupPage: string;
  playerToolbarOpacity: number;
  playerToolbarRadius: number;

  // 下面的设置项将不在设置页面中展示
  agreedAllAgreements: boolean;
  enableUserTracker: boolean;
  
  pinnedDMUsers: Array<string>;

  // 方屏输入法偏好；保存到既有 settings 键，避免组件直接访问账号存储。
  inputMethodSettings: {
    keyboardtype: string;
    lang: string;
    vibratemode: string;
    maxlength: number;
    traditional: boolean;
    keyboardtheme: string;
    doubletapshiftlock: boolean;
    autocapitalize: boolean;
  };
}

// 初始设置
export let SETTINGS: SettingsInterface = {
  fresh_type: 3,
  home_vid_count: 10,
  search_vid_count: 10,
  article_split_dom_count: 9999,
  enableFullAnimation: false,
  enableCommentPictures: false,
  startupPage: "主页",
  playerToolbarOpacity: 30,
  playerToolbarRadius: 30,

  agreedAllAgreements: false, // 是否已同意所有协议（用户协议 隐私协议 etc.）
  enableUserTracker: true,

  pinnedDMUsers: [],
  inputMethodSettings: {
    keyboardtype: "QWERTY",
    lang: "cn",
    vibratemode: "short",
    maxlength: 5,
    traditional: false,
    keyboardtheme: "dark",
    doubletapshiftlock: false,
    autocapitalize: false
  }
};

export function loadSettings(): Promise<void> {
  return new Promise((resolve) => {
    storage.get({
      key: 'settings',
      success: function (data) {
        if (data) {
          try {
            const storedSettings = JSON.parse(data);
            SETTINGS = {
              ...SETTINGS,
              ...storedSettings,
              inputMethodSettings: {
                ...SETTINGS.inputMethodSettings,
                ...(storedSettings.inputMethodSettings || {})
              }
            };
          } catch (error) {
            global.logger.log('Failed to parse stored settings');
          }
        }
        global.logger.log('Settings loaded:', SETTINGS);
        resolve();
      },
      fail: function (data, code) {
        global.logger.log(`Failed to load settings, code = ${code}`);
        resolve();
      }
    });
  });
}

export function saveSettings(params: Partial<SettingsInterface>): void {
  SETTINGS = {
    ...SETTINGS,
    ...params
  };
  storage.set({
    key: 'settings',
    value: JSON.stringify(SETTINGS),
    success: function () {
      global.logger.log('Settings saved successfully');
    },
    fail: function (data, code) {
      global.logger.log(`Failed to save settings, code = ${code}`);
    }
  });
}