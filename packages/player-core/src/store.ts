import type { PlayableItem, Program } from '@cps/shared';

/** 终端本地内容库接口：Capacitor 侧用 capacitor-sqlite 实现，Electron 侧用 better-sqlite3 实现 */
export interface ContentStore {
  listPrograms(): Promise<Program[]>;
  getProgram(id: string): Promise<Program | undefined>;
  putProgram(program: Program): Promise<void>;
  removeProgram(id: string): Promise<void>;
  listPendingDownloads(): Promise<PlayableItem[]>;
  markDownloaded(itemId: string, localPath: string): Promise<void>;
}

/** 内存实现：单测与 player-web 预览模式使用 */
export class InMemoryContentStore implements ContentStore {
  private programs = new Map<string, Program>();
  private pending: PlayableItem[] = [];

  listPrograms(): Promise<Program[]> {
    return Promise.resolve([...this.programs.values()]);
  }
  getProgram(id: string): Promise<Program | undefined> {
    return Promise.resolve(this.programs.get(id));
  }
  putProgram(program: Program): Promise<void> {
    this.programs.set(program.id, program);
    return Promise.resolve();
  }
  removeProgram(id: string): Promise<void> {
    this.programs.delete(id);
    return Promise.resolve();
  }
  listPendingDownloads(): Promise<PlayableItem[]> {
    return Promise.resolve([...this.pending]);
  }
  markDownloaded(itemId: string, localPath: string): Promise<void> {
    const it = this.pending.find((p) => p.id === itemId);
    if (it) it.localPath = localPath;
    return Promise.resolve();
  }
}
