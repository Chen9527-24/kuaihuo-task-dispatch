import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepSeekChatTestDto } from './dto/deepseek-chat-test.dto';

export type DeepSeekChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
};

export type DeepSeekThinkingMode = 'ENABLED' | 'DISABLED';

type DeepSeekChoice = {
  index?: number;
  message?: {
    role?: string;
    content?: string | null;
    reasoning_content?: string | null;
  };
  finish_reason?: string;
};

type DeepSeekChatResponse = {
  id?: string;
  model?: string;
  choices?: DeepSeekChoice[];
  usage?: DeepSeekUsage;
  error?: { message?: string; type?: string; code?: string };
};

@Injectable()
export class DeepSeekService {
  constructor(private readonly configService: ConfigService) {}

  async testChat(dto: DeepSeekChatTestDto) {
    // 保持既有独立 DeepSeek 测试接口的校验顺序：先检查后端 Key，再检查用户输入。
    // 新行业 AI 模块仅复用 chat()，不会改变旧测试接口的对外约定。
    if (!this.resolveApiKey()) {
      throw new BadRequestException('DeepSeek API Key 缺失，请在后端 .env 中配置 DEEPSEEK_API_KEY');
    }

    const userPrompt = String(dto.userPrompt || '').trim();
    if (!userPrompt) {
      throw new BadRequestException('用户输入不能为空');
    }

    return this.chat({
      messages: this.buildMessages(dto.systemPrompt, userPrompt),
      model: dto.model,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
      jsonMode: dto.jsonMode === true,
    });
  }

  /**
   * 供业务模块复用的 DeepSeek 多轮对话入口。
   * Key、超时、模型默认值和错误处理统一保留在后端，前端及其他模块不得直接请求 DeepSeek。
   */
  async chat(input: {
    messages: DeepSeekChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    timeoutMs?: number;
    thinkingMode?: DeepSeekThinkingMode;
  }) {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new BadRequestException('DeepSeek API Key 缺失，请在后端 .env 中配置 DEEPSEEK_API_KEY');
    }

    const messages = this.normalizeMessages(input.messages, input.jsonMode === true);
    if (!messages.length || !messages.some((message) => message.role === 'user')) {
      throw new BadRequestException('DeepSeek 对话至少需要一条用户消息');
    }

    const baseUrl = this.resolveBaseUrl();
    const model = this.resolveModel(input.model);
    const timeoutMs = input.timeoutMs === undefined
      ? this.resolveTimeoutMs()
      : this.clampInteger(input.timeoutMs, this.resolveTimeoutMs(), 2_000, 600_000);
    const effectiveMaxTokens = this.clampInteger(input.maxTokens, 1000, 1, 4000);
    const thinkingMode = input.thinkingMode ?? 'ENABLED';
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      max_tokens: effectiveMaxTokens,
      thinking: { type: thinkingMode === 'DISABLED' ? 'disabled' : 'enabled' },
    };

    // DeepSeek 思考模式会忽略 temperature。仅在非思考模式下发送，避免诊断误以为参数生效。
    if (thinkingMode === 'DISABLED') {
      body.temperature = this.clampNumber(input.temperature, 0.7, 0, 2);
    }

    if (input.jsonMode === true) {
      body.response_format = { type: 'json_object' };
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException(`DeepSeek API 调用超时（${timeoutMs}ms）`);
      }
      throw new BadGatewayException(this.resolveErrorMessage(error, 'DeepSeek API 调用失败'));
    } finally {
      clearTimeout(timer);
    }

    let responseParsed = true;
    const raw = (await response.json().catch(() => {
      responseParsed = false;
      return {};
    })) as DeepSeekChatResponse;
    if (!response.ok || raw.error) {
      const message = raw.error?.message || response.statusText || 'DeepSeek API 返回异常';
      throw new BadGatewayException(message);
    }

    const firstChoice = raw.choices?.[0];
    const usage = raw.usage ?? {};
    return {
      ok: true,
      responseValid: responseParsed && Boolean(firstChoice?.message),
      model: raw.model || model,
      requestedModel: model,
      content: String(firstChoice?.message?.content || ''),
      reasoningContent: String(firstChoice?.message?.reasoning_content || ''),
      finishReason: String(firstChoice?.finish_reason || ''),
      usage: {
        promptTokens: Number(usage.prompt_tokens ?? 0),
        completionTokens: Number(usage.completion_tokens ?? 0),
        totalTokens: Number(usage.total_tokens ?? 0),
        promptCacheHitTokens: Number(usage.prompt_cache_hit_tokens ?? 0),
        promptCacheMissTokens: Number(usage.prompt_cache_miss_tokens ?? 0),
        reasoningTokens: Number(usage.completion_tokens_details?.reasoning_tokens ?? 0),
      },
      requestId: String(raw.id || ''),
      elapsedMs: Date.now() - startedAt,
      requestedMaxTokens: input.maxTokens ?? 1000,
      effectiveMaxTokens,
      timeoutMs,
      thinkingMode,
    };
  }

  private buildMessages(systemPrompt?: string, userPrompt?: string): DeepSeekChatMessage[] {
    const messages: DeepSeekChatMessage[] = [];
    const normalizedSystemPrompt = String(systemPrompt || '').trim();
    const normalizedUserPrompt = String(userPrompt || '').trim();
    if (normalizedSystemPrompt) {
      messages.push({ role: 'system', content: normalizedSystemPrompt });
    }

    messages.push({ role: 'user', content: normalizedUserPrompt });
    return messages;
  }

  private normalizeMessages(messages: DeepSeekChatMessage[], jsonMode = false): DeepSeekChatMessage[] {
    const normalized = (messages || [])
      .map((message) => ({
        role: message?.role,
        content: String(message?.content || '').trim(),
      }))
      .filter((message): message is DeepSeekChatMessage => ['system', 'user', 'assistant'].includes(String(message.role)) && Boolean(message.content))
      .slice(-30);

    if (!jsonMode) return normalized;
    const jsonInstruction = '请只返回合法 JSON，不要输出 Markdown、代码块或解释性文字。';
    const firstSystemIndex = normalized.findIndex((message) => message.role === 'system');
    if (firstSystemIndex >= 0) {
      normalized[firstSystemIndex] = {
        ...normalized[firstSystemIndex],
        content: `${normalized[firstSystemIndex].content}\n\n${jsonInstruction}`,
      };
    } else {
      normalized.unshift({ role: 'system', content: jsonInstruction });
    }
    return normalized;
  }

  private resolveApiKey(): string {
    return String(this.configService.get<string>('DEEPSEEK_API_KEY') || process.env.DEEPSEEK_API_KEY || '').trim();
  }

  private resolveBaseUrl(): string {
    const value = String(
      this.configService.get<string>('DEEPSEEK_BASE_URL') ||
        this.configService.get<string>('DEEPSEEK_API_BASE_URL') ||
        process.env.DEEPSEEK_BASE_URL ||
        process.env.DEEPSEEK_API_BASE_URL ||
        'https://api.deepseek.com',
    ).trim();
    return value.replace(/\/$/, '');
  }

  private resolveModel(input?: string): string {
    return String(
      input ||
        this.configService.get<string>('DEEPSEEK_MODEL') ||
        this.configService.get<string>('DEEPSEEK_CHAT_MODEL') ||
        process.env.DEEPSEEK_MODEL ||
        process.env.DEEPSEEK_CHAT_MODEL ||
        'deepseek-v4-flash',
    ).trim();
  }

  private resolveTimeoutMs(): number {
    return this.clampInteger(
      Number(this.configService.get<string>('DEEPSEEK_TIMEOUT_MS') || process.env.DEEPSEEK_TIMEOUT_MS || 600_000),
      600_000,
      30_000,
      600_000,
    );
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number): number {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return fallback;
    return Math.min(max, Math.max(min, normalized));
  }

  private clampInteger(value: unknown, fallback: number, min: number, max: number): number {
    const normalized = Math.trunc(Number(value));
    if (!Number.isFinite(normalized)) return fallback;
    return Math.min(max, Math.max(min, normalized));
  }

  private resolveErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }
}
