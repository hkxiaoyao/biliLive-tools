import path from "node:path";
import os from "node:os";

import { Client, TvQrcodeLogin, WebVideoUploader } from "@renmu/bili-api";
import { appConfig, AppConfig } from "../config.js";
import { container } from "../index.js";

import {
  BiliAddVideoTask,
  taskQueue,
  BiliDownloadVideoTask,
  BiliPartVideoTask,
  BiliEditVideoTask,
} from "./task.js";
import log from "../utils/log.js";
import { sleep } from "../utils/index.js";

import type { BiliupConfig, BiliUser } from "@biliLive-tools/types";
import type { MediaOptions, DescV2 } from "@renmu/bili-api/dist/types/index.js";

type ClientInstance = InstanceType<typeof Client>;

/**
 * 生成client
 */
async function createClient(uid?: number) {
  const client = new Client();

  const mid = uid || appConfig.get("uid");

  if (!mid) throw new Error("请先登录");
  const user = await readUser(mid);
  client.setAuth(user!.cookie, user!.mid, user!.accessToken);
  return client;
}

export async function getRoomInfo(room_id: number, uid?: number) {
  const client = await createClient(uid);
  await client.live.getRoomInfo(room_id);
}

async function getArchives(
  params?: Parameters<ClientInstance["platform"]["getArchives"]>[0],
  uid?: number,
) {
  const client = await createClient(uid);
  return client.platform.getArchives(params);
}

async function checkTag(tag: string, uid: number) {
  const client = await createClient(uid);
  return client.platform.checkTag(tag);
}

async function searchTopic(keyword: string, uid: number) {
  const client = await createClient(uid);
  return client.platform.searchTopic({
    page_size: 20,
    offset: 0,
    keywords: keyword,
  });
}

async function getUserInfo(uid: number) {
  const client = await createClient(uid);
  return client.user.getUserInfo(uid);
}

async function getMyInfo(uid: number) {
  const client = await createClient(uid);
  return client.user.getMyInfo();
}

function login() {
  const tv = new TvQrcodeLogin();
  return tv.login();
}

async function getArchiveDetail(bvid: string, uid?: number) {
  const client = await createClient(uid);
  return client.video.detail({ bvid });
}

async function download(options: { bvid: string; cid: number; output: string }, uid: number) {
  const client = await createClient(uid);
  const ffmpegBinPath = appConfig.get("ffmpegPath");
  const tmpPath = path.join(os.tmpdir(), "biliLive-tools");
  const command = await client.video.download(
    { ...options, ffmpegBinPath, cachePath: tmpPath },
    {},
  );

  const task = new BiliDownloadVideoTask(
    command,
    {
      name: `下载任务：${path.parse(options.output).name}`,
    },
    {},
  );

  taskQueue.addTask(task, true);

  return {
    taskId: task.taskId,
  };
}

/**
 * 解析desc
 */
export function parseDesc(input: string): DescV2[] {
  const tokens: DescV2[] = [];

  const regex = /\[([^\]]*)\]<([^>]*)>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(input)) !== null) {
    const precedingText = input.substring(lastIndex, match.index);
    if (precedingText) {
      tokens.push({ raw_text: precedingText, type: 1, biz_id: "" });
    }

    const innerText = match[1];
    const biz_id = match[2];
    tokens.push({ raw_text: innerText, type: 2, biz_id });

    lastIndex = regex.lastIndex;
  }

  const trailingText = input.substring(lastIndex);
  if (trailingText) {
    tokens.push({ raw_text: trailingText, type: 1, biz_id: "" });
  }

  return tokens;
}

export function formatOptions(options: BiliupConfig) {
  const descV2 = parseDesc(options.desc || "");
  const hasAt = descV2.some((item) => item.type === 2);
  const desc = descV2
    .map((item) => {
      if (item.type === 1) {
        return item.raw_text;
      } else if (item.type === 2) {
        return `@${item.raw_text} `;
      } else {
        throw new Error(`不存在该type:${item.type}`);
      }
    })
    .join("");
  const tags = options.tag.map((item) => item.trim());
  if (options.topic_name) {
    tags.unshift(options.topic_name);
  }

  const data: MediaOptions = {
    cover: options.cover,
    title: options.title,
    tid: options.tid,
    tag: tags.slice(0, 10).join(","),
    copyright: options.copyright,
    source: options.source,
    dolby: options.dolby,
    lossless_music: options.hires,
    no_reprint: options.noReprint,
    up_close_danmu: options.closeDanmu ? true : false,
    up_close_reply: options.closeReply ? true : false,
    up_selection_reply: options.selectiionReply ? true : false,
    open_elec: options.openElec,
    desc_v2: hasAt ? descV2 : undefined,
    desc: desc,
    recreate: options.recreate || -1,
    no_disturbance: options.no_disturbance || 0,
    topic_id: options.topic_id,
    mission_id: options.mission_id,
  };
  return data;
}

/**
 * 合集列表
 */
async function getSeasonList(uid: number) {
  const client = await createClient(uid);
  return client.platform.getSeasonList();
}

/**
 * 上传视频接口
 */
export async function addMediaApi(
  uid: number,
  video: { cid: number; filename: string; title: string; desc?: string }[],
  options: BiliupConfig,
) {
  const mediaOptions = formatOptions(options);
  const client = await createClient(uid);
  return client.platform.addMediaClientApi(video, mediaOptions);
}

/**
 * 编辑视频接口
 */
export async function editMediaApi(
  uid: number,
  aid: number,
  video: { cid: number; filename: string; title: string; desc?: string }[],
  options: BiliupConfig,
) {
  const mediaOptions = formatOptions(options);
  const client = await createClient(uid);
  return client.platform.editMediaClientApi(video, { aid, ...mediaOptions }, "append");
}

async function addMedia(
  filePath:
    | string[]
    | {
        path: string;
        title?: string;
      }[],
  options: BiliupConfig,
  uid: number,
) {
  const client = await createClient(uid);

  const pTask = new BiliAddVideoTask(
    {
      name: `创建稿件：${options.title}`,
      uid,
      mediaOptions: options,
    },
    {
      onEnd: async (data: { aid: number; bvid: string }) => {
        try {
          // 合集相关功能
          if (options.seasonId) {
            const archive = await client.platform.getArchive({ aid: data.aid });
            log.debug("合集稿件", archive);
            if (archive.videos.length > 1) {
              log.warn("该稿件的分p大于1，无法加入分p", archive.archive.title);
              return;
            }
            const cid = archive.videos[0].cid;
            let sectionId = options.sectionId;
            if (!options.sectionId) {
              sectionId = (await client.platform.getSeasonDetail(options.seasonId)).sections
                .sections[0].id;
            }
            client.platform.addMedia2Season({
              sectionId: sectionId!,
              episodes: [
                {
                  aid: data.aid,
                  cid: cid,
                  title: options.title,
                },
              ],
            });
          }
        } catch (error) {
          log.error("加入合集失败", error);
        }
        // 自动评论
        if (options.autoComment && options.comment) {
          const commentQueue = container.resolve<BiliCommentQueue>("commentQueue");
          commentQueue.add({
            aid: data.aid,
            content: options.comment || "",
            uid: uid,
            top: options.commentTop || false,
          });
        }
      },
    },
  );

  const config = appConfig.getAll();
  const uploadOptions = config.biliUpload;
  for (const item of filePath) {
    const part = {
      path: typeof item === "string" ? item : item.path,
      title: typeof item === "string" ? path.parse(item).name : item.title,
    };
    const uploader = new WebVideoUploader(part, client.auth, uploadOptions);

    const task = new BiliPartVideoTask(
      uploader,
      {
        name: `上传视频：${part.title}`,
        pid: pTask.taskId,
      },
      {},
    );

    taskQueue.addTask(task, false);
    pTask.addTask(task);
  }
  taskQueue.addTask(pTask, true);

  return pTask;
}

export async function editMedia(
  aid: number,
  filePath:
    | string[]
    | {
        path: string;
        title?: string;
      }[],
  options: BiliupConfig | any,
  uid: number,
) {
  const client = await createClient(uid);

  const pTask = new BiliEditVideoTask(
    {
      name: `编辑稿件：${options.title}`,
      uid,
      mediaOptions: options,
      aid,
    },
    {},
  );

  const config = appConfig.getAll();
  const uploadOptions = config.biliUpload;
  for (const item of filePath) {
    const part = {
      path: typeof item === "string" ? item : item.path,
      title: typeof item === "string" ? path.parse(item).name : item.title,
    };
    const uploader = new WebVideoUploader(part, client.auth, uploadOptions);

    const task = new BiliPartVideoTask(
      uploader,
      {
        name: `上传视频：${part.title}`,
        pid: pTask.taskId,
      },
      {},
    );

    taskQueue.addTask(task, false);
    pTask.addTask(task);
  }
  taskQueue.addTask(pTask, true);

  return pTask;
}

async function getSessionId(
  aid: number,
  uid: number,
): Promise<{
  /** 合集id */
  id: number;
  title: string;
  desc: string;
  cover: string;
  isEnd: number;
  mid: number;
  isAct: number;
  is_pay: number;
  state: number;
  partState: number;
  signState: number;
  rejectReason: string;
  ctime: number;
  mtime: number;
  no_section: number;
  forbid: number;
  protocol_id: string;
  ep_num: number;
  season_price: number;
  is_opened: number;
}> {
  const client = await createClient(uid);
  return client.platform.getSessionId(aid);
}

/**
 * 获取创作中心的稿件详情
 */
async function getPlatformArchiveDetail(aid: number, uid: number) {
  const client = await createClient(uid);
  return client.platform.getArchive({ aid });
}

/**
 * 获取投稿分区
 */
async function getPlatformPre(uid: number) {
  const client = await createClient(uid);
  return client.platform.getArchivePre();
}

/**
 * 获取分区简介信息
 */
async function getTypeDesc(tid: number, uid: number) {
  const client = await createClient(uid);
  return client.platform.getTypeDesc(tid);
}

// b站评论队列
export class BiliCommentQueue {
  list: {
    uid: number;
    aid: number;
    status: "pending" | "completed" | "error";
    content: string;
    startTime: number;
    updateTime: number;
    top: boolean;
  }[] = [];
  interval: number = 1000 * 60 * 10;
  constructor({ appConfig }: { appConfig: AppConfig }) {
    this.list = [];
    this.interval = (appConfig?.data?.biliUpload?.checkInterval ?? 10 * 60) * 1000;
  }
  add(data: { aid: number; content: string; uid: number; top: boolean }) {
    // bvid是唯一的
    if (this.list.some((item) => item.aid === data.aid)) return;
    this.list.push({
      uid: data.uid,
      aid: data.aid,
      content: data.content,
      top: data.top,
      status: "pending",
      startTime: Date.now(),
      updateTime: Date.now(),
    });
  }
  async check() {
    const list = await this.filterList();
    for (const item of list) {
      try {
        const res = await this.addComment(item);
        console.log("评论成功", res);
        await sleep(3000);
        await this.top(res.rpid, item);
        item.status = "completed";
      } catch (error) {
        item.status = "error";
        log.error("评论失败", error);
      }
    }
  }
  /**
   * 过滤出通过审核的稿件
   */
  async filterList() {
    const allowCommentList: number[] = [];
    const uids = this.list.map((item) => item.uid);
    for (const uid of uids) {
      const res = await biliApi.getArchives({ pn: 1, ps: 20 }, uid);
      allowCommentList.push(
        ...res.arc_audits.filter((item) => item.stat.aid).map((item) => item.Archive.aid),
      );
    }
    log.debug("评论队列", this.list);

    this.list.map((item) => {
      // 更新操作时间，如果超过24小时，状态设置为error
      item.updateTime = Date.now();
      if (item.updateTime - item.startTime > 1000 * 60 * 60 * 24) {
        item.status = "error";
      }
    });
    return this.list.filter((item) => {
      return allowCommentList.some((aid) => aid === item.aid) && item.status === "pending";
    });
  }
  async addComment(item: { aid: number; content: string; uid: number }): Promise<{
    rpid: number;
  }> {
    const client = await createClient(item.uid);
    // @ts-ignore
    return client.reply.add({
      oid: item.aid,
      type: 1,
      message: item.content,
      plat: 1,
    });
  }
  async top(rpid: number, item: { aid: number; uid: number }) {
    const client = await createClient(item.uid);

    return client.reply.top({ oid: item.aid, type: 1, action: 1, rpid });
  }

  checkLoop = async () => {
    try {
      await this.check();
    } finally {
      setTimeout(this.checkLoop, this.interval);
    }
  };
}

// 验证配置
export const validateBiliupConfig = async (config: BiliupConfig) => {
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
    if (config.topic_name) {
      msg = "转载类型稿件不支持活动参加哦~";
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

export const biliApi = {
  getArchives,
  checkTag,
  searchTopic,
  login,
  getUserInfo,
  getMyInfo,
  addMedia,
  editMedia,
  getSeasonList,
  getArchiveDetail,
  getPlatformPre,
  getTypeDesc,
  download,
  getSessionId,
  getPlatformArchiveDetail,
  validateBiliupConfig,
};
