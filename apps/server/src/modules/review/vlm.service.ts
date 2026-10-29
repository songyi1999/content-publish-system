import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AiVerdict } from './review.service';

/** 图片/视频内容安全审核（AV-05/AV-06）：OpenAI 兼容多模态大模型（自建网关） */
@Injectable()
export class VlmService {
  private readonly logger = new Logger(VlmService.name);

  private cfg(): { base: string; model: string; key: string } | null {
    const base = process.env.AI_REVIEW_BASE_URL;
    const model = process.env.AI_REVIEW_MODEL;
    const key = process.env.AI_REVIEW_API_KEY;
    if (!base || !model || !key) return null;
    return { base, model, key };
  }

  get configured(): boolean {
    return this.cfg() !== null;
  }

  /** 单张图片审核：data URL 送入多模态模型，要求 JSON 结论 */
  async reviewImage(buffer: Buffer, mime: string): Promise<AiVerdict> {
    const cfg = this.cfg();
    if (!cfg) return { pass: true, riskLevel: 'none', hits: [{ word: 'VLM未配置，跳过图片审核', position: 0 }] };
    const dataUrl = `data:${mime || 'image/jpeg'};base64,${buffer.toString('base64')}`;
    const content = `你是一名内容安全审核员。请审核这张图片是否存在：色情低俗、暴力血腥、涉政敏感、违规标识、广告二维码等风险。
只输出 JSON：{"pass": true|false, "riskLevel": "none"|"suspect"|"violation", "reason": "简要原因"}`;
    // 网关多模态偶发 400，重试一次吸收抖动
    let lastErr = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`${cfg.base.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
          body: JSON.stringify({
            model: cfg.model,
            messages: [{ role: 'user', content: [{ type: 'text', text: content }, { type: 'image_url', image_url: { url: dataUrl } }] }],
            max_tokens: 300,
          }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) throw new Error(`vlm ${res.status} ${(await res.text()).slice(0, 120)}`);
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return this.parse(data.choices?.[0]?.message?.content ?? '');
      } catch (e) {
        lastErr = (e as Error).message;
      }
    }
    this.logger.warn(`图片审核失败（放行待人工复审兜底）: ${lastErr}`);
    return { pass: true, riskLevel: 'none', hits: [{ word: `VLM调用失败:${lastErr}`, position: 0 }] };
  }

  /** 视频审核（AV-06）：抽 3 帧逐帧走图片审核，任一命中即命中 */
  async reviewVideo(absPath: string, frameCount = 3): Promise<AiVerdict> {
    const dir = await mkdtemp(join(tmpdir(), 'cps-vframes-'));
    try {
      const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
      // 抽帧数可配置（AV-07）：1~6 帧，均匀取样，默认 3
      const n = Math.min(6, Math.max(1, Math.round(frameCount) || 3));
      const positions = Array.from({ length: n }, (_, i) => `${Math.round((100 * (i + 0.5)) / n)}%`);
      for (let i = 0; i < positions.length; i++) {
        await new Promise<void>((done) => {
          const p = spawn(ffmpeg, ['-ss', positions[i], '-i', absPath, '-frames:v', '1', '-vf', 'scale=640:-1', '-y', join(dir, `f${i}.jpg`)]);
          p.on('error', () => done());
          p.on('close', () => done());
        });
      }
      const files = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
      if (files.length === 0) {
        return { pass: true, riskLevel: 'none', hits: [{ word: 'ffmpeg 不可用，抽帧审核跳过（人工复审兜底）', position: 0 }] };
      }
      let worst: AiVerdict = { pass: true, riskLevel: 'none', hits: [] };
      for (const f of files) {
        const v = await this.reviewImage(await readFile(join(dir, f)), 'image/jpeg');
        if (!v.pass && (worst.riskLevel === 'none' || (v.riskLevel === 'violation' && worst.riskLevel !== 'violation'))) {
          worst = v;
        }
      }
      return worst;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private parse(text: string): AiVerdict {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return { pass: true, riskLevel: 'none', hits: [{ word: `VLM返回不可解析:${text.slice(0, 60)}`, position: 0 }] };
    try {
      const j = JSON.parse(m[0]) as { pass?: boolean; riskLevel?: string; reason?: string };
      const level = j.riskLevel === 'violation' || j.riskLevel === 'suspect' ? j.riskLevel : j.pass === false ? 'suspect' : 'none';
      return {
        pass: j.pass !== false && level === 'none',
        riskLevel: level as AiVerdict['riskLevel'],
        hits: j.reason ? [{ word: `VLM:${j.reason}`, position: 0 }] : [],
      };
    } catch {
      return { pass: true, riskLevel: 'none', hits: [{ word: 'VLM返回JSON解析失败', position: 0 }] };
    }
  }
}

export function resolveMedia(root: string, rel: string): string {
  return resolve(root, rel);
}
