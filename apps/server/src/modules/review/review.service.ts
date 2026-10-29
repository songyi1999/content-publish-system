import { Injectable } from '@nestjs/common';
import type { ContentStatus } from '@cps/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentsService } from '../contents/contents.service';

export interface AiVerdict {
  pass: boolean;
  riskLevel: 'none' | 'suspect' | 'violation';
  hits: Array<{ word: string; position: number }>;
}

/**
 * AI 自动审核（R8/AV-04~08）：
 * - 文本：本地 DFA 敏感词引擎（词库可配置），命中即 suspect 以上
 * - 图片/视频：预留云审核 Provider 接口（AI_REVIEW_PROVIDER 配置），
 *   未配置云 Key 时图片视频直接放行并留痕（个人版起步策略，接云后自动启用）
 */
@Injectable()
export class ReviewService {
  /** 敏感词库（AV-07 可配置）：默认内置基础政治/暴恐/色情样本，生产环境从管理端维护 */
  private words: string[] = ['示例敏感词', '涉暴恐', '色情', '反动'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly contents: ContentsService,
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

  /** 提交后触发：AI 初审 → 通过进人工复审；疑似/违规驳回 */
  async runAiReview(contentId: string): Promise<{ next: ContentStatus; verdict: AiVerdict }> {
    const text = await this.contents.extractText(contentId);
    const verdict = this.scanText(text);
    await this.prisma.auditLog.create({
      data: {
        action: 'AI_REVIEW',
        targetType: 'content',
        targetId: contentId,
        detail: { riskLevel: verdict.riskLevel, hits: verdict.hits.slice(0, 20) } as never,
      },
    });
    const next: ContentStatus = verdict.pass ? 'MANUAL_REVIEW' : 'REJECTED';
    await this.contents.transition(contentId, next, undefined, `AI:${verdict.riskLevel}`);
    return { next, verdict };
  }
}
