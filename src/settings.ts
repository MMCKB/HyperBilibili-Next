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
    keyboardtheme: "dark"
  }
};

// storage.get 的 Promise 封装：fail 时 reject 错误码
// （Vela 通用错误码：300=I/O 错误 200=系统错误 202=参数错误）
function readSettingsFromStorage(): Promise<string> {
  return new Promise((resolve, reject) => {
    storage.get({
      key: 'settings',
      success: function (data) {
        resolve(data);
      },
      fail: function (data, code) {
        reject(code);
      }
    });
  });
}

export async function loadSettings(): Promise<void> {
  // 冷启动时 storage.get 偶发 I/O 失败（错误码 300），若静默放弃会让
  // SETTINGS 保持出厂默认（agreedAllAgreements=false），已同意协议的
  // 用户会被误带回协议页。这里重试两次对抗偶发失败。
  // 注意：key 不存在时按文档走 success 返回空字符串，不会进 fail，
  // 因此重试不会把"首次使用"误判为失败。
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await readSettingsFromStorage();
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
      return;
    } catch (code) {
      global.logger.log(`Failed to load settings, code = ${code}, attempt ${attempt}/3`);
    }
  }
  // 三次全部失败：保持出厂默认继续运行（协议页可自恢复，不阻断启动）
  global.logger.log('Settings load finally failed after retries, keeping defaults');
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