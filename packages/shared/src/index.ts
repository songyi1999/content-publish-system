/**
 * 服务端 / 管理后台 / 双端客户端共享的协议定义。
 * 修改本文件后需在根目录执行 pnpm build 使各端生效。
 */

/* ---------------- 内容状态机（R6/R8 审核工作流） ---------------- */
export const ContentStatus = {
  DRAFT: 'DRAFT',
  AI_REVIEW: 'AI_REVIEW',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
} as const;
export type ContentStatus = (typeof ContentStatus)[keyof typeof ContentStatus];

/** 允许的状态迁移；发布仅可从 APPROVED 触发（编辑-审核-发布职责分离） */
export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: [ContentStatus.AI_REVIEW],
  AI_REVIEW: [ContentStatus.MANUAL_REVIEW, ContentStatus.REJECTED],
  MANUAL_REVIEW: [ContentStatus.APPROVED, ContentStatus.REJECTED],
  APPROVED: [ContentStatus.PUBLISHED],
  PUBLISHED: [],
  REJECTED: [ContentStatus.DRAFT],
};

/* ---------------- 发布任务（R1） ---------------- */
export const TaskStatus = {
  PENDING: 'PENDING',
  DOWNLOADING: 'DOWNLOADING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TargetType = {
  ALL: 'ALL',
  GROUP: 'GROUP',
  DEVICE: 'DEVICE',
} as const;
export type TargetType = (typeof TargetType)[keyof typeof TargetType];

/* ---------------- 终端通信协议（R2/R3 心跳与指令） ---------------- */
export const DeviceEvent = {
  HELLO: 'device:hello',
  HEARTBEAT: 'device:heartbeat',
  COMMAND: 'device:command',
  RESULT: 'device:result',
} as const;

export const DeviceCommandType = {
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
  UPDATE_APP: 'update_app',
  REBOOT: 'reboot',
  SHUTDOWN: 'shutdown',
  SCREENSHOT: 'screenshot',
  SET_VOLUME: 'set_volume',
} as const;
export type DeviceCommandType = (typeof DeviceCommandType)[keyof typeof DeviceCommandType];

export interface DeviceCommand<T = unknown> {
  id: string;
  type: DeviceCommandType;
  payload?: T;
  /** 指令下发时间戳（ms），终端用于防重放） */
  issuedAt: number;
}

export interface HeartbeatPayload {
  deviceCode: string;
  appVersion?: string;
  storageFreeBytes?: number;
  currentProgramId?: string | null;
}

/* ---------------- 排期（R12：分时段 + 优先级冲突模型） ---------------- */
export interface ScheduleSlot {
  id: string;
  programId: string;
  /** 数值越大优先级越高；紧急插播使用最高级（100） */
  priority: number;
  /** 0=周日 … 6=周六；缺省表示每天 */
  daysOfWeek?: number[];
  /** 一天内的开始分钟（含），0~1440，默认 0 */
  startMinute?: number;
  /** 一天内的结束分钟（不含），默认 1440；小于 startMinute 表示跨午夜 */
  endMinute?: number;
}

/* ---------------- 播放内容模型（player-core 与服务端共用） ---------------- */
export const PlayableType = {
  IMAGE: 'image',
  VIDEO: 'video',
  WEB: 'web',
  TEXT: 'text',
} as const;
export type PlayableType = (typeof PlayableType)[keyof typeof PlayableType];

export interface PlayableItem {
  id: string;
  type: PlayableType;
  title?: string;
  /** 本地存储相对路径（终端离线播放用，R2） */
  localPath?: string;
  /** 服务端地址（下载阶段使用） */
  remoteUrl?: string;
  /** 富文本正文（终端直接渲染，无需下载） */
  html?: string;
  /** 单条停留秒数；视频缺省按自身时长 */
  durationSec?: number;
  /** sha256 校验值，用于断点续传后的完整性校验 */
  sha256?: string;
}

export interface Program {
  id: string;
  name: string;
  items: PlayableItem[];
  /** 分屏版式模板标识（R11 模板化编排） */
  layout?: 'full' | 'left-right' | 'three-col' | 'video-ticker';
}

/* ---------------- REST DTO ---------------- */
export interface LoginDto {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  username: string;
  role: string;
}

export interface DeviceDto {
  id: string;
  code: string;
  name: string | null;
  groupId: string | null;
  appVersion: string | null;
  ip: string | null;
  lastSeenAt: string | null;
  online: boolean;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  message: string;
}
export type ApiResult<T> = ApiOk<T> | ApiErr;
