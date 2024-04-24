import log from "./utils/log";
import { appConfig, videoPreset } from "@biliLive-tools/shared";
import { biliApi } from "./bili";

import type { IpcMainInvokeEvent } from "electron";
import type {
  BiliupConfig,
  BiliupConfigAppend,
  BiliupPreset,
  BiliUser,
} from "@biliLive-tools/types";

// 验证配置
export const validateBiliupConfig = async (_event: IpcMainInvokeEvent, config: BiliupConfig) => {
  let msg: string | undefined = undefined;
  if (!config.title) {
    msg = "标题不能为空";
  }
  if (config.title.length > 80) {
    msg = "标题不能超过80个字符";
  }
  // if (config.desc && config.desc.length > 250) {
  //   msg = "简介不能超过250个字符";
  // }
  if (config.copyright === 2) {
    if (!config.source) {
      msg = "转载来源不能为空";
    } else {
      if (config.source.length > 200) {
        msg = "转载来源不能超过200个字符";
      }
    }
  }
  if (config.tag.length === 0) {
    msg = "标签不能为空";
  }
  if (config.tag.length > 12) {
    msg = "标签不能超过12个";
  }

  if (msg) {
    throw new Error(msg);
  }
  return true;
};

// 删除bili登录的cookie
export const deleteUser = async (uid: number) => {
  const users = appConfig.get("biliUser") || {};
  delete users[uid];
  appConfig.set("biliUser", users);
  return true;
};

// 写入用户数据
export const writeUser = async (data: BiliUser) => {
  const users = appConfig.get("biliUser") || {};
  users[data.mid] = data;
  appConfig.set("biliUser", users);
};

// 读取用户数据
export const readUser = async (mid: number): Promise<BiliUser | undefined> => {
  const users = appConfig.get("biliUser") || {};
  return users[mid];
};

// 读取用户列表
export const readUserList = async (): Promise<BiliUser[]> => {
  const users = appConfig.get("biliUser") || {};
  return Object.values(users) as unknown as BiliUser[];
};

export const format = async (data: any) => {
  const cookieObj = {};
  (data?.cookie_info?.cookies || []).map((item: any) => (cookieObj[item.name] = item.value));

  const result: BiliUser = {
    mid: data.mid,
    rawAuth: JSON.stringify(data),
    cookie: cookieObj as any,
    expires: data.expires_in,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    platform: "TV",
  };

  try {
    const biliUser = await biliApi.getUserInfo(data.mid);
    result.name = biliUser.name;
    result.avatar = biliUser.face;
  } catch (e) {
    log.error(e);
  }

  return result;
};

export const handlers = {
  "bili:validUploadParams": validateBiliupConfig,
  "bili:getPreset": (_event: IpcMainInvokeEvent, id: string) => {
    return videoPreset.get(id);
  },
  "bili:savePreset": (_event: IpcMainInvokeEvent, presets: BiliupPreset) => {
    return videoPreset.save(presets);
  },
  "bili:deletePreset": (_event: IpcMainInvokeEvent, id: string) => {
    return videoPreset.delete(id);
  },
  "bili:getPresets": () => {
    return videoPreset.list();
  },
  "bili:deleteUser": (_event: IpcMainInvokeEvent, mid: number) => {
    return deleteUser(mid);
  },
  "bili:removeUser": async (_event: IpcMainInvokeEvent, mid: number) => {
    const users = appConfig.get("biliUser") || {};
    delete users[mid];
    appConfig.set("biliUser", users);
  },
  "bili:readUserList": () => {
    return readUserList();
  },
  "bili:uploadVideo": async (
    _event: IpcMainInvokeEvent,
    uid: number,
    pathArray: string[],
    options: BiliupConfig,
  ) => {
    biliApi.addMedia(_event.sender, pathArray, options, uid);
  },
  "bili:appendVideo": async (
    _event: IpcMainInvokeEvent,
    uid: number,
    pathArray: string[],
    options: BiliupConfigAppend,
  ) => {
    biliApi.editMedia(_event.sender, options.vid as number, pathArray, options, uid);
  },
};
