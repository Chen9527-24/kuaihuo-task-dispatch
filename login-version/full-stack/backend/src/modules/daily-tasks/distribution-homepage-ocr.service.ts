import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ocr } from 'tencentcloud-sdk-nodejs';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from '../files/files.service';

type OcrLine = {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type AccountIdCandidate = {
  value: string;
  /** 带“抖音号 / 小红书号 / 视频号”等标签的行，用于锁定昵称相对位置。 */
  anchor: OcrLine;
};

type RecognitionResult = {
  detectedPlatform: string | null;
  platformConfidence: number | null;
  nicknameCandidate: string | null;
  accountIdCandidate: string | null;
  ocrText: string;
  status: 'SUCCEEDED' | 'REVIEW_REQUIRED';
  error: string | null;
};

const PENDING_STATUSES = ['PENDING'] as const;
const COMPLETED_STATUSES = new Set(['SUCCEEDED', 'REVIEW_REQUIRED']);

/**
 * 持久化主页截图 OCR worker。
 *
 * 任务状态保存在数据库，进程重启后会重新领取 PENDING / 超时 PROCESSING 的任务；
 * OCR 结果只是候选信息，不会写入或覆盖任务账号的手工昵称、手机号。
 */
@Injectable()
export class DistributionHomepageOcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DistributionHomepageOcrService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private client?: InstanceType<typeof ocr.v20181119.Client>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) return;
    void this.processQueuedJobs();
    this.timer = setInterval(() => void this.processQueuedJobs(), 2_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  isEnabled() {
    return this.toBoolean(this.get('TENCENT_OCR_ENABLED'));
  }

  /**
   * 常规入队保持幂等：同一截图已完成识别时不重复扣费。
   * 管理端需要核验历史结果时，应使用 requeue() 显式发起一次新的识别。
   */
  async enqueue(profileId: string) {
    return this.queue(profileId, false);
  }

  /**
   * 显式重新识别：仅重置已结束的记录；正在排队或识别中的任务不重复创建，避免并发调用 OCR。
   */
  async requeue(profileId: string) {
    return this.queue(profileId, true);
  }

  private async queue(profileId: string, force: boolean) {
    const profile = await this.prisma.distributionTaskAccountHomepageRecognition.findUnique({
      where: { id: profileId },
    });
    if (!profile) return null;

    if (!this.isEnabled()) {
      return this.prisma.distributionTaskAccountHomepageRecognition.update({
        where: { id: profile.id },
        data: { ocrStatus: 'NOT_ENABLED', ocrError: null },
      });
    }

    if (!profile.homepageProofFileId) {
      return this.prisma.distributionTaskAccountHomepageRecognition.update({
        where: { id: profile.id },
        data: { ocrStatus: 'FAILED', ocrError: '未找到需要识别的主页截图', ocrCompletedAt: new Date() },
      });
    }

    const currentStatus = String(profile.ocrStatus || '').toUpperCase();
    const inProgress = currentStatus === 'PENDING' || currentStatus === 'PROCESSING';
    if (inProgress || (!force && COMPLETED_STATUSES.has(currentStatus))) {
      return profile;
    }

    const queued = await this.prisma.distributionTaskAccountHomepageRecognition.update({
      where: { id: profile.id },
      data: {
        ...(force
          ? {
              detectedPlatform: null,
              platformConfidence: null,
              nicknameCandidate: null,
              accountIdCandidate: null,
              ocrText: null,
            }
          : {}),
        ocrStatus: 'PENDING',
        ocrError: null,
        ocrRequestedAt: new Date(),
        ocrStartedAt: null,
        ocrCompletedAt: null,
      },
    });
    void this.processQueuedJobs();
    return queued;
  }

  private async processQueuedJobs() {
    if (!this.isEnabled() || this.running) return;
    this.running = true;
    try {
      await this.requeueStaleJobs();
      // 单实例串行处理，避免因突发多张截图超过 OCR API 限流或占满进程内存。
      while (await this.processOneJob()) {
        // drain current queue only while the worker owns it
      }
    } catch (error: any) {
      this.logger.error(`主页 OCR worker 异常：${this.safeErrorMessage(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async requeueStaleJobs() {
    const staleAt = new Date(Date.now() - 2 * 60 * 1000);
    await this.prisma.distributionTaskAccountHomepageRecognition.updateMany({
      where: { ocrStatus: 'PROCESSING', ocrStartedAt: { lt: staleAt } },
      data: {
        ocrStatus: 'PENDING',
        ocrError: '上次识别未完成，已自动重试',
        ocrStartedAt: null,
      },
    });
  }

  private async processOneJob() {
    const candidate = await this.prisma.distributionTaskAccountHomepageRecognition.findFirst({
      where: { ocrStatus: { in: [...PENDING_STATUSES] } },
      orderBy: [{ ocrRequestedAt: 'asc' }, { updatedAt: 'asc' }],
      select: { id: true },
    });
    if (!candidate) return false;

    const claimed = await this.prisma.distributionTaskAccountHomepageRecognition.updateMany({
      where: { id: candidate.id, ocrStatus: 'PENDING' },
      data: {
        ocrStatus: 'PROCESSING',
        ocrStartedAt: new Date(),
        ocrAttemptCount: { increment: 1 },
        ocrError: null,
      },
    });
    if (!claimed.count) return true;

    const profile = await this.prisma.distributionTaskAccountHomepageRecognition.findUnique({
      where: { id: candidate.id },
      select: {
        id: true,
        expectedPlatform: true,
        homepageProofFileId: true,
      },
    });
    if (!profile?.homepageProofFileId) {
      await this.fail(candidate.id, '未找到需要识别的主页截图');
      return true;
    }

    try {
      const file = await this.filesService.getFile(profile.homepageProofFileId);
      const source = await this.filesService.readStoredObjectBuffer(file);
      const image = await this.prepareImage(source);
      const result = await this.callOcr(image, profile.expectedPlatform);
      await this.prisma.distributionTaskAccountHomepageRecognition.update({
        where: { id: candidate.id },
        data: {
          detectedPlatform: result.detectedPlatform,
          platformConfidence: result.platformConfidence,
          nicknameCandidate: result.nicknameCandidate,
          accountIdCandidate: result.accountIdCandidate,
          ocrText: result.ocrText || null,
          ocrStatus: result.status,
          ocrError: result.error,
          ocrCompletedAt: new Date(),
        },
      });
    } catch (error: any) {
      await this.fail(candidate.id, this.safeErrorMessage(error));
    }
    return true;
  }

  private async fail(profileId: string, message: string) {
    // 仅记录任务 ID 与已截断错误信息；不记录图片内容、OCR 原文或任何密钥。
    this.logger.warn(`主页 OCR 识别失败 profileId=${profileId}，原因=${message.slice(0, 500)}`);
    await this.prisma.distributionTaskAccountHomepageRecognition.update({
      where: { id: profileId },
      data: {
        ocrStatus: 'FAILED',
        ocrError: message.slice(0, 500),
        ocrCompletedAt: new Date(),
      },
    });
  }

  private async prepareImage(source: Buffer) {
    const maxBytes = this.getNumber('TENCENT_OCR_MAX_IMAGE_BYTES', 5 * 1024 * 1024);
    let output = await sharp(source, { limitInputPixels: 268_402_689, failOn: 'warning' })
      .rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    if (output.length <= maxBytes) return output;

    output = await sharp(output)
      .resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    if (output.length <= maxBytes) return output;
    throw new Error('主页截图过大，无法生成 OCR 识别图');
  }

  private async callOcr(image: Buffer, expectedPlatform: string): Promise<RecognitionResult> {
    const response = await this.getClient().GeneralAccurateOCR({
      ImageBase64: image.toString('base64'),
    });
    const lines = this.toLines(response?.TextDetections);
    if (!lines.length) {
      return {
        detectedPlatform: null,
        platformConfidence: null,
        nicknameCandidate: null,
        accountIdCandidate: null,
        ocrText: '',
        status: 'REVIEW_REQUIRED',
        error: '未识别到可用文字，请上传包含主页顶部信息的清晰截图',
      };
    }

    const expected = String(expectedPlatform || '').trim().toUpperCase();
    const platform = this.detectPlatform(lines);
    const looksLikeTaskOperationPage = this.looksLikeTaskOperationPage(lines);
    const mismatch = Boolean(platform.platform && expected && platform.platform !== expected);
    const noPlatform = !platform.platform;
    // 主页识别只作为辅助信息：没有识别到当前任务平台，或截图明显是本系统的任务操作页时，
    // 不允许把任意页面文案兜底写成“昵称候选”。
    const canExtractCandidate = !looksLikeTaskOperationPage && Boolean(platform.platform) && !mismatch;
    const accountId = canExtractCandidate ? this.extractAccountIdCandidate(lines, platform.platform) : null;
    const accountIdCandidate = accountId?.value || null;
    // 昵称必须位于“平台账号 ID”标签的紧邻资料区。禁止再从整张截图做泛化评分，
    // 否则头像背景、系统入口、个人简介等文字极易被误判为昵称。
    const nicknameCandidate = canExtractCandidate ? this.extractNickname(lines, accountId?.anchor) : null;
    const noCandidate = !nicknameCandidate && !accountIdCandidate;
    const missingNickname = !nicknameCandidate;
    const status: RecognitionResult['status'] = looksLikeTaskOperationPage || mismatch || noPlatform || noCandidate || missingNickname
      ? 'REVIEW_REQUIRED'
      : 'SUCCEEDED';
    const expectedLabel = expected ? this.platformLabel(expected) : '当前任务平台';
    const error = looksLikeTaskOperationPage
      ? `当前上传内容疑似任务操作页面，请上传完整的${expectedLabel}个人主页截图`
      : mismatch
        ? `识别到的平台疑似为${this.platformLabel(platform.platform!)}，与当前任务平台不一致，请核对主页截图`
        : noPlatform
          ? '未识别出明确的平台文案，请核对主页截图'
          : noCandidate
            ? '未能可靠定位昵称或账号 ID，请核对截图'
            : missingNickname
              ? '账号 ID 已识别，但未能可靠定位昵称，请核对截图'
              : null;

    return {
      detectedPlatform: platform.platform,
      platformConfidence: platform.confidence,
      nicknameCandidate,
      accountIdCandidate,
      ocrText: lines.map((line) => line.text).join('\n').slice(0, 6000),
      status,
      error,
    };
  }

  private toLines(value: unknown): OcrLine[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item: any) => {
        const text = String(item?.DetectedText || '').replace(/\s+/g, ' ').trim();
        const polygon = item?.ItemPolygon || {};
        return {
          text,
          confidence: Number(item?.Confidence || 0),
          x: Number(polygon?.X || 0),
          y: Number(polygon?.Y || 0),
          width: Number(polygon?.Width || 0),
          height: Number(polygon?.Height || 0),
        };
      })
      .filter((line) => Boolean(line.text));
  }

  private looksLikeTaskOperationPage(lines: OcrLine[]) {
    const joined = lines.map((line) => line.text).join('\n');
    const markers = [
      /用户主页截图/,
      /评论截图\s*\/\s*点赞截图/,
      /第三步\s*[:：]?\s*确认完成/,
      /提交截图后.*运营审核结算/,
      /按页面步骤完成互动/,
    ];
    let configuredHostMatch = 0;
    try {
      const hostname = new URL(String(this.configService.get<string>('H5_BASE_URL') || '')).hostname;
      configuredHostMatch = hostname && joined.toLowerCase().includes(hostname.toLowerCase()) ? 1 : 0;
    } catch {
      // 未配置 H5 地址时只使用通用的任务页文字特征。
    }
    // 单个词可能恰好出现在合法主页内容中；命中至少两个任务页特征后才判为错误输入。
    return configuredHostMatch + markers.filter((pattern) => pattern.test(joined)).length >= 2;
  }

  private detectPlatform(lines: OcrLine[]) {
    const joined = lines.map((line) => line.text.toLowerCase()).join('\n');
    const scores: Record<string, number> = {
      DOUYIN: 0,
      XIAOHONGSHU: 0,
      WECHAT_VIDEO: 0,
    };
    const add = (platform: string, patterns: RegExp[], score: number) => {
      if (patterns.some((pattern) => pattern.test(joined))) scores[platform] += score;
    };
    add('DOUYIN', [/抖音号/, /抖音/, /douyin/, /tiktok/], 100);
    add('XIAOHONGSHU', [/小红书号/, /小红书/, /xiaohongshu/, /rednote/], 100);
    add('WECHAT_VIDEO', [/视频号/, /微信视频号/, /微信号/], 100);

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topPlatform, score] = sorted[0] || ['', 0];
    return {
      platform: score > 0 ? topPlatform : null,
      confidence: score > 0 ? Math.min(100, score) : null,
    };
  }

  private extractAccountIdCandidate(lines: OcrLine[], platform: string | null): AccountIdCandidate | null {
    const labelPattern = this.getAccountIdLabelPattern(platform);
    if (!labelPattern) return null;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const inlineMatch = line.text.match(
        new RegExp(`${labelPattern.source}\\s*[:：]?\\s*@?([a-zA-Z0-9_.-]{3,100})`, 'i'),
      );
      const inlineValue = this.toAccountId(inlineMatch?.[1]);
      if (inlineValue) return { value: inlineValue, anchor: line };

      if (!labelPattern.test(line.text)) continue;
      const nextValue = this.toAccountId(lines[index + 1]?.text);
      if (nextValue) return { value: nextValue, anchor: line };
    }
    return null;
  }

  private getAccountIdLabelPattern(platform: string | null) {
    const normalized = String(platform || '').trim().toUpperCase();
    if (normalized === 'DOUYIN') return /抖音\s*(?:号|ID)/i;
    if (normalized === 'XIAOHONGSHU') return /(?:小红书\s*(?:号|ID)|薯号)/i;
    if (normalized === 'WECHAT_VIDEO') return /(?:微信视频号|视频号|微信号)/i;
    return null;
  }

  private toAccountId(value: unknown) {
    const text = String(value || '')
      .replace(/^\s*[@#]/, '')
      .replace(/[，,;；。.!！]+$/, '')
      .trim();
    return /^[a-zA-Z0-9_.-]{3,100}$/.test(text) ? text.slice(0, 100) : null;
  }

  private extractNickname(lines: OcrLine[], accountAnchor?: OcrLine): string | null {
    if (!accountAnchor) return null;

    const candidates = lines
      .map((line) => {
        const text = this.toNicknameCandidate(line.text);
        if (!text || line === accountAnchor) return null;

        const candidateBottom = line.y + Math.max(1, line.height);
        const verticalGap = accountAnchor.y - candidateBottom;
        const maxVerticalGap = Math.max(24, Math.max(line.height, accountAnchor.height) * 2.6);
        // 昵称应直接位于账号 ID 标签上方；允许极小的 OCR 坐标误差，但不跨越资料区。
        if (verticalGap < -Math.max(2, accountAnchor.height * 0.15) || verticalGap > maxVerticalGap) return null;

        const horizontalOffset = Math.abs(line.x - accountAnchor.x);
        const maxHorizontalOffset = Math.max(36, Math.max(line.height, accountAnchor.height) * 3);
        // 名称和“抖音号 / 小红书号 / 视频号”通常左对齐。该约束可排除头像背景的横幅文案。
        if (horizontalOffset > maxHorizontalOffset) return null;

        const confidence = Math.min(30, Math.max(0, line.confidence) / 3);
        const score = 1_000 - verticalGap * 12 - horizontalOffset * 2 + confidence;
        return { text, score, verticalGap, horizontalOffset, y: line.y };
      })
      .filter((item): item is { text: string; score: number; verticalGap: number; horizontalOffset: number; y: number } => Boolean(item))
      .sort((a, b) => b.score - a.score || b.y - a.y || a.text.localeCompare(b.text));

    return candidates[0]?.text || null;
  }

  private toNicknameCandidate(value: unknown) {
    const text = String(value || '')
      .replace(/^(?:昵称|名称)\s*[:：]\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length < 2 || text.length > 40) return null;
    if (/^(https?:\/\/|www\.)/i.test(text)) return null;
    if (/^[\d,.万wW]+$/.test(text)) return null;
    if (/^[a-zA-Z0-9_.-]{3,100}$/.test(text)) return null;
    if (/^[\d\s|·•-]+$/.test(text)) return null;

    // 仅排除明确的页面控件与资料字段，不根据字符串长度、全屏位置等弱信号猜昵称。
    const excluded = /^(?:关注|粉丝|获赞|喜欢|作品|私信|直播|编辑资料|编辑主页|主页|IP属地|抖音\s*(?:号|ID)|小红书\s*(?:号|ID)|薯号|视频号|微信视频号|微信号|账号|收藏|点赞|转发|评论|分享|更多|设置|搜索|消息|我的订单|观看历史|创作者中心|我的钱包|全部功能|私密作品|草稿箱|新评论|日常|推荐)$/i;
    if (excluded.test(text)) return null;
    return text;
  }

  private getClient() {
    if (!this.client) {
      const secretId = this.require('TENCENT_OCR_SECRET_ID');
      const secretKey = this.require('TENCENT_OCR_SECRET_KEY');
      this.client = new ocr.v20181119.Client({
        credential: { secretId, secretKey },
        region: this.get('TENCENT_OCR_REGION') || 'ap-guangzhou',
        profile: {
          httpProfile: {
            endpoint: 'ocr.tencentcloudapi.com',
            reqTimeout: this.getNumber('TENCENT_OCR_REQUEST_TIMEOUT_MS', 25_000),
          },
        },
      } as any);
    }
    return this.client;
  }

  private platformLabel(platform: string) {
    return ({ DOUYIN: '抖音', XIAOHONGSHU: '小红书', WECHAT_VIDEO: '视频号' } as Record<string, string>)[platform] || platform;
  }

  private safeErrorMessage(error: unknown) {
    const value = error instanceof Error ? error.message : String(error || 'OCR 服务暂时不可用');
    return value.replace(/\s+/g, ' ').trim().slice(0, 500) || 'OCR 服务暂时不可用';
  }

  private require(name: string) {
    const value = this.get(name);
    if (!value) throw new Error(`OCR 配置缺失：${name}`);
    return value;
  }

  private get(name: string) {
    return String(this.configService.get<string>(name) ?? '').trim();
  }

  private getNumber(name: string, fallback: number) {
    const value = Number(this.configService.get<number | string>(name) ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private toBoolean(value: string) {
    return ['true', '1', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
  }
}
