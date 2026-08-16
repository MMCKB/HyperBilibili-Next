# HyperBilibili-Next

> 运行在 Xiaomi Vela OS 上的第三方哔哩哔哩客户端

![Build Status](https://github.com/MMCKB/HyperBilibili-Next/actions/workflows/build.yml/badge.svg)
[![GitHub Release](https://img.shields.io/github/v/release/MMCKB/HyperBilibili-Next)](https://github.com/MMCKB/HyperBilibili-Next/releases)
[![License](https://img.shields.io/github/license/MMCKB/HyperBilibili-Next)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/MMCKB/HyperBilibili-Next)](https://github.com/MMCKB/HyperBilibili-Next/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/MMCKB/HyperBilibili-Next)](https://github.com/MMCKB/HyperBilibili-Next/network/members)

## 原项目

[![Original Repository](https://img.shields.io/badge/Original-Searchstars/HyperBilibili-blue)](https://github.com/Searchstars/HyperBilibili)

## 感谢人员

[@Searchstars](https://github.com/Searchstars) 与 [@fwzjszd](https://github.com/fwzjszd)

## 📖 介绍

- 基于原版 HyperBilibili 二改而来
- 增加许多原版没有/缺失的功能（如：发送 Emoji、发送动态、查看消息中心详情、关注列表等功能）
- 该项目提供了 GitHub Actions 工作流来构建项目

## 子项目 / 分支

1. 澎湃哔哩"米环版"：[https://github.com/OnDriveLine/HyperBilibili_Band](https://github.com/OnDriveLine/HyperBilibili_Band)
   - 专为 `小米手环9`（band9 分支）、`小米手环9 Pro`（MB9P 分支）等设备移植的澎湃哔哩客户端

## 使用

对于普通用户而非开发者，你只需要下载本应用的 release 版本（RPK 文件）然后安装到你的设备上就行了。

- 开发版包名：`com.searchstars.hyperbilibili.dev`
- release 版包名：`com.searchstars.hyperbilibili`

## 搭建开发环境

克隆此仓库，然后在 `Aiot IDE` 中打开它。

本项目使用 yarn 作为包管理器：

```bash
# 安装 yarn（Debian 系 Linux）
sudo apt install yarn

# 安装 yarn（Windows）
winget install Yarn.Yarn

# 在项目目录下安装依赖
yarn
```

## 开发文档

通过小米的[官方文档](https://iot.mi.com/vela/quickapp)熟悉和了解快应用。

## 声明

本项目与哔哩哔哩（Bilibili）官方无任何关联，包括但不限于 **哔哩哔哩股份有限公司**、**上海幻电信息科技有限公司**、**上海宽娱数码科技有限公司**。

本项目所使用的所有 API 接口均来自 [https://github.com/SocialSisterYi/bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)，经过来自各界网友的测试与修正，本人未对哔哩哔哩（Bilibili）的任何客户端进行任何逆向工程（包括但不限于反编译、反汇编、抓包、拆包）操作。
