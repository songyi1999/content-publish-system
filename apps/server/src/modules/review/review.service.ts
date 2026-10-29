import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import type { ContentStatus } from '@cps/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ContentsService } from '../contents/contents.service';
import { VlmService } from './vlm.service';

export interface AiVerdict {
  pass: boolean;
  riskLevel: 'none' | 'suspect' | 'violation';
  hits: Array<{ word: string; position: number }>;
}

/**
 * AI 自动审核（R8/AV-04~08）：
 * - 文本：本地 DFA 敏感词引擎（词库可配置）
 * - 图片/视频：自建多模态大模型网关（OpenAI 兼容），视频抽 3 帧逐帧审核
 * - VLM 不可用时放行进入人工复审兜底，调用结果全部留痕
 */
@Injectable()
export class ReviewService {
  /** 敏感词库（AV-07 可配置） */
  private words: string[] = ['示例敏感词', '涉暴恐', '色情', '反动'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly contents: ContentsService,
    private readonly vlm: VlmService,
    private readonly storage: StorageService,
  ) {}

  getSensitiveWords(): string[] {
    return this.words;
  }

  setSensitiveWords(list: string[]): void {
    this.words = [...new Set(list.filter((w) => w && w.trim()))];
  }

  scanText(text: string): AiVerdict {
    const hits: Array<{ word: string; position: number }> = [];
    for (const word of this.words) {
      let idx = text.indexOf(word);
      while (idx >= 0) {
        hits.push({ word, position: idx });
        idx = text.indexOf(word, idx + word.length);
      }
    }
    if (hits.length === 0) return { pass: true, riskLevel: 'none', hits };
    return { pass: false, riskLevel: hits.length >= 3 ? 'violation' : 'suspect', hits };
  }

  /** 提交后触发：文本 DFA + 图片/视频 VLM → 全部通过进人工复审；命中驳回 */
  async runAiReview(contentId: string): Promise<{ next: ContentStatus; verdict: AiVerdict }> {
    const text = await this.contents.extractText(contentId);
    const verdicts: AiVerdict[] = [this.scanText(text)];

    const content = await this.prisma.content.findUnique({ where: { id: contentId }, include: { media: true } });
    if (content?.media && ['image', 'video'].includes(content.media.kind)) {
      try {
        const abs = resolve(this.storage.rootDir, content.media.storagePath);
        const buf = await readFile(abs);
        if (content.media.kind === 'image') {
          verdicts.push(await this.vlm.reviewImage(buf, content.media.mimeType ?? 'image/jpeg'));
        } else {
          verdicts.push(await this.vlm.reviewVideo(abs));
        }
      } catch (e) {
        verdicts.push({ pass: true, riskLevel: 'none', hits: [{ word: `媒体读取失败:${(e as Error).message}`, position: 0 }] });
      }
    }

    const merged: AiVerdict = {
      pass: verdicts.every((v) => v.pass),
      riskLevel: verdicts.some((v) => v.riskLevel === 'violation')
        ? 'violation'
        : verdicts.some((v) => v.riskLevel === 'suspect')
          ? 'suspect'
          : 'none',
      hits: verdicts.flatMap((v) => v.hits).slice(0, 20),
    };
    await this.prisma.auditLog.create({
      data: {
        action: 'AI_REVIEW',
        targetType: 'content',
        targetId: contentId,
        detail: { riskLevel: merged.riskLevel, hits: merged.hits.slice(0, 20), vlm: this.vlm.configured } as never,
      },
    });
    const next: ContentStatus = merged.pass ? 'MANUAL_REVIEW' : 'REJECTED';
    await this.contents.transition(contentId, next, undefined, `AI:${merged.riskLevel}`);
    return { next, verdict: merged };
  }
}

import { resolve } from 'node:path';
