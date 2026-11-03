import { buildClassificationMessages } from './classification-prompt.mjs';

export function readModelConfig() {
  const config = {
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? '',
    baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() ?? '',
    model: process.env.DEEPSEEK_MODEL?.trim() ?? '',
  };
  const missing = [
    ['DEEPSEEK_API_KEY', config.apiKey],
    ['DEEPSEEK_BASE_URL', config.baseUrl],
    ['DEEPSEEK_MODEL', config.model],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`缺少配置：${missing.join('、')}。`);
  return config;
}

// 分类练习保留原来的调用方式，底层复用支持工具消息的通用请求。
export function requestClassification(userInput, config) {
  return requestModelMessages(buildClassificationMessages(userInput), config);
}

// 只负责模型请求，不在这里执行工具、授权或给分类打分。
export async function requestModelMessages(messages, config, { tools, toolChoice } = {}) {
  const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      thinking: { type: 'disabled' },
      max_tokens: 512,
      ...(tools ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const hints = {
      400: '检查模型与请求参数',
      401: '检查服务端API Key配置',
      402: '检查API余额',
      429: '暂时限流或额度限制，检查平台说明后再决定是否重试',
    };
    const error = new Error(`HTTP ${response.status}：${hints[response.status] ?? '接口返回错误'}。`);
    error.httpStatus = response.status;
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
    throw new Error('API响应体不是可读取的JSON，尚未进入模型答案校验。');
  }

  const toolCalls = data?.choices?.[0]?.message?.tool_calls ?? [];
  if (!Array.isArray(toolCalls)) throw new Error('API返回的tool_calls不是数组。');
  return {
    content: data?.choices?.[0]?.message?.content ?? null,
    finishReason: data?.choices?.[0]?.finish_reason ?? null,
    actualModel: data?.model ?? null,
    toolCalls,
    // 回传时同时保留模型提出的工具调用及其ID，不能只发送工具结果。
    message: {
      role: 'assistant',
      content: data?.choices?.[0]?.message?.content ?? null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    usage: {
      input: data?.usage?.prompt_tokens ?? null,
      output: data?.usage?.completion_tokens ?? null,
      total: data?.usage?.total_tokens ?? null,
    },
  };
}

export function describeRequestError(error) {
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return '请求超时或已中止；结果未知，不自动重试。';
  }
  if (error instanceof TypeError) return '请求未完成，请检查网络、服务地址及配置。';
  return error.message;
}
