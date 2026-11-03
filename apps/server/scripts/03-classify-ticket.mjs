import { readModelConfig, requestClassification, describeRequestError } from './model-client.mjs';
import { validateClassification } from './classification-validator.mjs';

// 完整链路：配置 → 消息 → 模型请求 → API响应 → 答案校验 → 业务结果。
// 本课暂不自动重试，也不会查询或创建真实工单。
async function main() {
  const config = readModelConfig();
  const userInput = process.argv[2]?.trim() || '公司网络打不开网页';
  console.info('正在请求DeepSeek，将使用API额度；本次不自动重试。');
  const answer = await requestClassification(userInput, config);
  // 校验失败也可能已经消耗Token，因此先记录供应商实际返回的usage。
  console.info('Token用量：', JSON.stringify(answer.usage));
  if (answer.finishReason === 'length') {
    throw new Error('模型输出因长度限制被截断，不接受为完整分类结果。');
  }

  // 第二层解析和校验：content是模型答案字符串，由校验器解析并检查约定。
  const result = validateClassification(answer.content);
  console.info('输出校验通过（不代表分类语义一定正确）：');
  console.info(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(`处理失败：${describeRequestError(error)}`);
  process.exitCode = 1;
}
