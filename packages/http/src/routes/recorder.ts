import Router from "koa-router";

import { pick } from "lodash-es";
import recorderService from "../services/recorder.js";

import type { RecorderAPI } from "../types/recorder.js";

const router = new Router({
  prefix: "/recorder",
});

router.get("/list", async (ctx) => {
  const query: RecorderAPI["getRecorders"]["Args"] = ctx.request.query;

  ctx.body = { payload: await recorderService.getRecorders(query) };
});
router.post("/add", async (ctx) => {
  const args = pick(
    (ctx.request.body ?? {}) as RecorderAPI["addRecorder"]["Args"],
    "providerId",
    "channelId",
    "remarks",
    "disableAutoCheck",
    "quality",
    "streamPriorities",
    "sourcePriorities",
    "extra",
    "noGlobalFollowFields",
    "line",
    "disableProvideCommentsWhenRecording",
    "saveGiftDanma",
    "saveSCDanma",
    "segment",
    "sendToWebhook",
    "uid",
    "saveCover",
  );

  const data = await recorderService.addRecorder(args);
  ctx.body = { payload: data };
});

router.get("/:id", (ctx) => {
  const { id } = ctx.params;
  ctx.body = { payload: recorderService.getRecorder({ id }) };
});
router.put("/:id", (ctx) => {
  const { id } = ctx.params;
  const patch = pick(
    ctx.request.body as Omit<RecorderAPI["updateRecorder"]["Args"], "id">,
    "remarks",
    "disableAutoCheck",
    "quality",
    "streamPriorities",
    "sourcePriorities",
    "noGlobalFollowFields",
    "line",
    "disableProvideCommentsWhenRecording",
    "saveGiftDanma",
    "saveSCDanma",
    "saveCover",
    "segment",
    "sendToWebhook",
    "uid",
  );

  ctx.body = { payload: recorderService.updateRecorder({ id, ...patch }) };
});
router.delete("/:id", (ctx) => {
  const { id } = ctx.params;
  ctx.body = { payload: recorderService.removeRecorder({ id }) };
});

router.post("/:id/start_record", async (ctx) => {
  const { id } = ctx.params;
  ctx.body = { payload: await recorderService.startRecord({ id }) };
});
router.post("/:id/stop_record", async (ctx) => {
  const { id } = ctx.params;
  ctx.body = { payload: await recorderService.stopRecord({ id }) };
});

router.post("/:id/stop_record", async (ctx) => {
  const { id } = ctx.params;
  ctx.body = { payload: await recorderService.stopRecord({ id }) };
});

// router.get(":id/history", async (ctx) => {
// const { id } = ctx.params;
// 分页
// const { page, pageSize,startTime,endTime } = ctx.query
// ctx.body = { payload: await recorder.getHistory() };
// });

router.get("/manager/resolveChannel", async (ctx) => {
  const { url } = ctx.query;
  const data = await recorderService.resolveChannel(url as string);

  ctx.body = { payload: data };
});

router.get("/manager/liveInfo", async (ctx) => {
  const list = await recorderService.getLiveInfo();
  ctx.body = {
    payload: list,
  };
});

export default router;
