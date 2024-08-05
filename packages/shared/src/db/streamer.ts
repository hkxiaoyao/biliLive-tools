import BaseModel from "./baseModel.js";
import { validateAndFilter } from "./utils.js";

import type { Database } from "sqlite";

interface BaseStreamer {
  name: string;
  platform: "bilibili" | "douyu" | "unknown" | string;
  room_id: string;
}

interface Streamer extends BaseStreamer {
  id: number;
  created_at: number;
}

class StreamerModel extends BaseModel<BaseStreamer> {
  table = "streamer";

  constructor(db: Database) {
    super(db, "streamer");
  }

  async createTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,           -- 自增主键
        name TEXT NOT NULL,                             -- 主播名
        room_id TEXT NOT NULL,                          -- 房间id
        platform TEXT DEFAULT unknown,                -- 平台，bilibili，douyu，unknown
        created_at INTEGER DEFAULT (strftime('%s', 'now')),  -- 创建时间，时间戳，自动生成
        UNIQUE(name, room_id)                           -- 唯一联合约束
      ) STRICT;
    `;
    return super.createTable(createTableSQL);
  }
}

export default class StreamerController {
  private model: StreamerModel;
  private requireFields: (keyof BaseStreamer)[] = ["name", "room_id", "platform"];
  async init(db: Database) {
    this.model = new StreamerModel(db);
    await this.model.createTable();
  }

  async add(options: BaseStreamer) {
    const filterOptions = validateAndFilter(options, this.requireFields, []);
    console.log(filterOptions, options);
    return this.model.insert(options);
  }
  async addMany(list: BaseStreamer[]) {
    return this.model.insertMany(list);
  }

  async list(options: Partial<Streamer>): Promise<Streamer[]> {
    const filterOptions = validateAndFilter(options, this.requireFields, []);
    return this.model.list(filterOptions);
  }

  async query(options: Partial<Streamer>) {
    const filterOptions = validateAndFilter(options, this.requireFields, []);
    console.log(filterOptions, options);
    return this.model.query(filterOptions);
  }
  async upsert(options: { where: Partial<Streamer & { id: number }>; create: BaseStreamer }) {
    return this.model.upsert(options);
  }

  async close() {
    return this.model.close();
  }
}
