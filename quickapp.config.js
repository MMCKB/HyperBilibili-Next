const path = require('path');
const childProcess = require('child_process');
const os = require('os');
const fs = require('fs');

// 注入buildinfo
const gitCommitHash = childProcess.execSync('git rev-parse HEAD').toString().trim();
const username = os.userInfo().username;
const buildTime = new Date().toISOString();
const designWidth = JSON.parse(fs.readFileSync("src/manifest.json")).config.designWidth

// 分支名：CI 为 detached HEAD（git 返回 HEAD），优先读 GITHUB_REF；本地用 git 命令
let gitBranch = '';
if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/heads/')) {
    gitBranch = process.env.GITHUB_REF.slice('refs/heads/'.length);
} else if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/pull/')) {
    gitBranch = process.env.GITHUB_REF; // PR 构建，保留完整 ref
} else {
    try {
        gitBranch = childProcess.execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    } catch (e) {
        gitBranch = '';
    }
}

// 短 hash：手表屏上 40 位 hash 换行难看，默认显示 7 位
const gitCommitHashShort = gitCommitHash.slice(0, 7);

// 构建来源：GitHub Actions CI / 本地
const buildSource = process.env.GITHUB_ACTIONS === 'true'
    ? `GitHub Actions${process.env.GITHUB_RUN_ID ? ' #' + process.env.GITHUB_RUN_ID : ''}`
    : 'local';

// 应用版本（manifest 现成）
const manifest = JSON.parse(fs.readFileSync("src/manifest.json"));
const versionName = manifest.versionName || '';
const versionCode = manifest.versionCode || '';

const buildInfoContent = `
  export const GIT_COMMIT_HASH = "${gitCommitHash}";
  export const GIT_COMMIT_HASH_SHORT = "${gitCommitHashShort}";
  export const GIT_BRANCH = "${gitBranch}";
  export const BUILD_TIME = "${buildTime}";
  export const BUILD_USER = "${username}";
  export const BUILD_SOURCE = "${buildSource}";
  export const VERSION_NAME = "${versionName}";
  export const VERSION_CODE = "${versionCode}";
  export const DESIGN_WIDTH = ${designWidth};
`;

const buildInfoPath = path.resolve(__dirname, 'src/buildinfo.ts');
fs.writeFileSync(buildInfoPath, buildInfoContent, 'utf8');

module.exports = {
    // 在toolkit2.0以及更高版本，这实际上是对rspack的配置
    webpack: {
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: [/node_modules/],
                    // 因为这实际上是针对rspack的配置，所以可以使用builtin:swc-loader
                    // 使用该loader可以大幅度提升typescript转换效率
                    loader: 'builtin:swc-loader',
                    options: {
                        jsc: {
                            parser: {
                                syntax: 'typescript',
                            },
                        },
                    },
                    type: 'javascript/auto',
                }
            ]
        },
        resolve: {
            alias: {
                '@src': path.resolve(__dirname, 'src'),
                '@components': path.resolve(__dirname, 'src/components'),
                '@less': path.resolve(__dirname, 'src/less'),
                '@protobuf': path.resolve(__dirname, 'src/protobuf'),
                '$buildinfo': buildInfoPath
            }
        }
    },
    cli: {
        "enable-custom-component": true,
        "enable-jsc": true,
        "enable-protobuf": true
    }
};