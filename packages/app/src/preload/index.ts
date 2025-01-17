import path from "node:path";
import fs from "fs-extra";

import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { webUtils } from "electron";

import type { IpcRendererEvent, SaveDialogOptions } from "electron";
import type {
  Progress,
  DanmuOptions,
  FfmpegOptions,
  AppConfig,
  DanmuConfig,
  hotProgressOptions,
  Theme,
  DanmuItem,
} from "@biliLive-tools/types";
import type { OpenDialogOptions } from "../types";
import type ffmpeg from "@renmu/fluent-ffmpeg";

type startCallback = (params: { command?: string }) => void;
type endCallback = (params: { output?: string }) => void;
type errorCallback = (params: { err?: string; taskId?: string }) => void;
type progressCallback = (params: { percentage?: number }) => void;

// Custom APIs for renderer
export const api = {
  dbQuery: (options) => {
    return ipcRenderer.invoke("db:query", options);
  },
  dbList: (options) => {
    return ipcRenderer.invoke("db:list", options);
  },
  addWithStreamer: (options) => {
    return ipcRenderer.invoke("db:addWithStreamer", options);
  },
  danmu: {
    convertXml2Ass: (
      file: {
        input: string;
        output?: string;
      },
      config: DanmuConfig,
      options: DanmuOptions = {
        saveRadio: 1,
        savePath: "",
        removeOrigin: false,
        copyInput: false,
      },
    ) => {
      return ipcRenderer.invoke("danmu:convertXml2Ass", file, config, options);
    },
    isEmptyDanmu(input: string) {
      return ipcRenderer.invoke("danmu:isEmptyDanmu", input);
    },
    // danmu:generateDanmakuImage
    genHotProgress(input: string, options: hotProgressOptions) {
      return ipcRenderer.invoke("danmu:genHotProgress", input, options);
    },

    genTimeData(input: string) {
      return ipcRenderer.invoke("danmu:genTimeData", input);
    },
    parseDanmu(input: string): Promise<{
      danmu: DanmuItem[];
      sc: DanmuItem[];
      hotProgress: {
        time: number;
        value: number;
        color: string;
      }[];
    }> {
      return ipcRenderer.invoke("danmu:parseDanmu", input, {});
    },
  },
  task: {
    on(
      taskId: string,
      event: "start" | "end" | "error" | "progress",
      callback: startCallback | endCallback | errorCallback | progressCallback,
    ) {
      if (event === "start") {
        ipcRenderer.on(
          `task-start`,
          (
            _event,
            data: {
              taskId: string;
              command: string;
            },
          ) => {
            console.log("render:start", data);
            if (data.taskId === taskId) {
              callback({ command: data.command });
            }
          },
        );
      } else if (event === "end") {
        ipcRenderer.on(
          `task-end`,
          (
            _event,
            data: {
              taskId: string;
              output: string;
            },
          ) => {
            if (data.taskId === taskId) {
              callback({
                output: data.output,
                taskId: data.taskId,
              });
            }
          },
        );
      } else if (event === "error") {
        ipcRenderer.on(
          `task-error`,
          (
            _event,
            data: {
              taskId: string;
              err: string;
            },
          ) => {
            if (data.taskId === taskId) {
              callback({
                err: data.err,
              });
            }
          },
        );
      } else if (event === "progress") {
        ipcRenderer.on(
          `task-progress`,
          (
            _event,
            data: {
              taskId: string;
              progress: Progress;
            },
          ) => {
            if (data.taskId === taskId) {
              callback({
                // percentage: data.progress,
              });
            }
          },
        );
      }
    },
  },
  common: {
    getTempPath: async () => {
      return ipcRenderer.invoke("common:getTempPath");
    },
    readFile: (path: string) => {
      return fs.readFile(path, "utf-8");
    },
    writeFile: (path: string, data: string) => {
      return fs.writeFile(path, data);
    },
    relaunch: () => {
      return ipcRenderer.invoke("common:relaunch");
    },
    showItemInFolder: (path: string) => {
      return ipcRenderer.invoke("common:showItemInFolder", path);
    },
    setOpenAtLogin: (openAtLogin: boolean) => {
      return ipcRenderer.invoke("common:setOpenAtLogin", openAtLogin);
    },
    setTheme: (theme: Theme) => {
      return ipcRenderer.invoke("common:setTheme", theme);
    },
    getPathForFile: (file: globalThis.File) => {
      return webUtils.getPathForFile(file);
    },
    mkdir: (path: string) => {
      return fs.mkdir(path);
    },
    execFile: (file: string, args: string[]) => {
      return ipcRenderer.invoke("common:execFile", file, args);
    },
  },
  config: {
    save: (newConfig: AppConfig) => {
      return ipcRenderer.invoke("config:save", newConfig);
    },
    get: (key: string) => {
      return ipcRenderer.invoke("config:get", key);
    },
    getAll: (): Promise<AppConfig> => {
      return ipcRenderer.invoke("config:getAll");
    },
    set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
      return ipcRenderer.invoke("config:set", key, value);
    },
  },
  mergeAssMp4: async (
    files: {
      videoFilePath: string;
      assFilePath?: string | null;
      outputPath: string;
      hotProgressFilePath: string | undefined;
    },
    options: {
      removeOrigin: boolean;
      override: boolean;
      startTimestamp?: number;
      timestampFont?: string;
    } = {
      removeOrigin: false,
      override: true,
      startTimestamp: 0,
      timestampFont: undefined,
    },
    ffmpegOptions: FfmpegOptions = {
      encoder: "libx264",
    },
  ) => {
    return await ipcRenderer.invoke("mergeAssMp4", files, options, ffmpegOptions);
  },
  readVideoMeta: (file: string): Promise<ffmpeg.FfprobeData> => {
    return ipcRenderer.invoke("readVideoMeta", file);
  },

  // 通用函数
  openDirectory: (
    opts: {
      defaultPath?: string;
      buttonLabel?: string;
      title?: string;
    } = {},
  ): Promise<string | undefined> => {
    return ipcRenderer.invoke("dialog:openDirectory", opts);
  },
  openFile: (options: OpenDialogOptions): Promise<string[] | undefined> => {
    return ipcRenderer.invoke("dialog:openFile", options);
  },
  showSaveDialog: (options?: SaveDialogOptions): Promise<string | undefined> => {
    return ipcRenderer.invoke("dialog:save", options);
  },
  // appVersion: () => {
  //   return ipcRenderer.invoke("getVersion");
  // },
  openExternal: (url: string) => {
    return ipcRenderer.invoke("openExternal", url);
  },
  openPath: (path: string) => {
    return ipcRenderer.invoke("openPath", path);
  },
  exits: (path: string) => {
    return ipcRenderer.invoke("exits", path);
  },

  openSetting: (callback: (_event: IpcRendererEvent) => void) => {
    ipcRenderer.on("open-setting", callback);
  },
  openLog: (callback: (_event: IpcRendererEvent) => void) => {
    ipcRenderer.on("open-log", callback);
  },
  openChangelog: (callback: (_event: IpcRendererEvent) => void) => {
    ipcRenderer.on("open-changelog", callback);
  },
  onMainNotify: (
    callback: (
      _event: IpcRendererEvent,
      data: {
        type: "info" | "success" | "warning" | "error";
        content: string;
      },
    ) => void,
  ) => {
    ipcRenderer.on("notify", callback);
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
    contextBridge.exposeInMainWorld("path", path);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  window.api = api;
}
