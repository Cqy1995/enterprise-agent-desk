import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClassificationMessages } from './classification-prompt.mjs';
import { readModelConfig, requestClassification, describeRequestError } from './model-client.mjs';
import { validateClassification } from './classification-validator.mjs';

// expectedCategory只用于本地评分，绝不传给模型。
const cases = JSON.parse(await readFile(new URL('../../../evals/classification/cases.json', import.meta.url), 'utf8'));
const categories = ['网络与远程接入', '设备启动与硬件', '待澄清'];
if (!Array.isArray(cases) || cases.length === 0 || cases.some((c) =>
  typeof c.id !== 'string' || typeof c.input !== 'string' || !c.input.trim()
  || !categories.includes(c.expectedCategory)) || new Set(cases.map((c) => c.id)).size !== cases.length) {
  throw new Error('评测集为空，或存在无效输入、类别、编号。');
}

async function main() {
  if (process.argv.includes('--preview')) {
    console.info(`预览：共${cases.length}条，正式运行时每条请求一次；当前不发送请求。`);
    console.table(cases);
    return;
  }

  const config = readModelConfig();
  const startedAt = new Date().toISOString();
  const promptTemplate = buildClassificationMessages('__USER_INPUT__');
  const promptHash = createHash('sha256').update(JSON.stringify(promptTemplate)).digest('hex');
  const results = [];
  let stoppedReason = null;
  console.info(`真实批量评测：最多${cases.length}次请求，串行执行，每条只请求一次，不自动重试；将使用API额度。`);

  for (const example of cases) {
    const result = {
      ...example,
      status: 'pending',
      actualContent: null,
      actualCategory: null,
      actualModel: null,
      finishReason: null,
      formatValid: false,
      categoryCorrect: false,
      usage: { input: null, output: null, total: null },
      durationMs: null,
      error: null,
    };
    // 鉴权、余额、参数或限流错误后不继续轰炸接口，剩余条目标记未执行。
    if (stoppedReason) {
      result.status = 'skipped';
      result.error = stoppedReason;
      results.push(result);
      continue;
    }

    console.info(`正在评测：${example.id}`);
    const start = performance.now();
    let answer;
    try {
      answer = await requestClassification(example.input, config);
    } catch (error) {
      result.status = 'request_error';
      result.error = describeRequestError(error);
      result.durationMs = Math.round(performance.now() - start);
      results.push(result);
      if ([400, 401, 402, 429].includes(error.httpStatus)) stoppedReason = result.error;
      continue;
    }

    result.durationMs = Math.round(performance.now() - start);
    result.actualContent = answer.content;
    result.actualModel = answer.actualModel;
    result.finishReason = answer.finishReason;
    result.usage = answer.usage;
    try {
      if (answer.finishReason === 'length') throw new Error('输出被截断，不能接受为完整结果。');
      const classification = validateClassification(answer.content);
      result.formatValid = true;
      result.actualCategory = classification.category;
      result.categoryCorrect = classification.category === example.expectedCategory;
      result.status = result.categoryCorrect ? 'correct' : 'wrong_category';
    } catch (error) {
      result.status = 'invalid_output';
      result.error = error.message;
    }
    results.push(result);
  }

  // 分母固定为全部计划样例，不能偷偷排除错误或未执行项。
  const total = cases.length;
  const attempted = results.filter((r) => r.status !== 'skipped').length;
  const received = results.filter((r) => !['request_error', 'skipped'].includes(r.status)).length;
  const valid = results.filter((r) => r.formatValid).length;
  const correct = results.filter((r) => r.categoryCorrect).length;
  const knownUsage = results.filter((r) => Number.isFinite(r.usage.total));
  const knownTotalTokens = knownUsage.reduce((sum, r) => sum + r.usage.total, 0);
  const summary = {
    planned: total, attempted, received, skipped: total - attempted,
    valid, correct,
    outputComplianceRate: valid / total,
    endToEndCategoryPassRate: correct / total,
    knownTotalTokens,
    usageReportedCount: knownUsage.length,
    usageMissingForAttempted: attempted - knownUsage.length,
    stoppedReason,
  };

  console.table(results.map((r) => ({
    编号: r.id, 预期: r.expectedCategory, 实际: r.actualCategory ?? '不可用',
    状态: r.status, 输出合规: r.formatValid ? '是' : '否',
    分类通过: r.categoryCorrect ? '是' : '否', 耗时毫秒: r.durationMs,
    错误: r.error ?? '',
  })));
  console.info(`已请求${attempted}/${total}条，收到可解析API响应${received}条，未执行${summary.skipped}条。`);
  console.info(`输出合规率（全样例口径）：${valid}/${total} = ${(valid / total * 100).toFixed(0)}%`);
  console.info(`端到端分类通过率：${correct}/${total} = ${(correct / total * 100).toFixed(0)}%`);
  console.info(`已知Token合计：${knownTotalTokens}；${summary.usageMissingForAttempted}条已请求样例缺少完整usage，未知消耗不按0计算。`);

  const report = {
    startedAt, finishedAt: new Date().toISOString(), requestedModel: config.model,
    parameters: { stream: false, thinking: { type: 'disabled' }, max_tokens: 512, timeoutMs: 30_000 },
    promptHash, promptTemplate, summary, results,
    limitations: '五条开发样例，非独立保留集；仅评类别，不评澄清质量；单次运行，不代表生产准确率。API错误及未执行项不应解释为模型分类错误。',
  };
  // 测试时可以将报告写入临时目录；默认保存到项目内，报告不包含Key或请求头。
  const reportDir = process.env.EVAL_REPORT_DIR
    ? resolve(process.env.EVAL_REPORT_DIR)
    : fileURLToPath(new URL('../../../evals/reports/', import.meta.url));
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `classification-${startedAt.replace(/[:.]/g, '-')}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
  console.info(`报告已保存：${reportPath}`);
  console.info('本次只评类别，不代表澄清问题有用；小样例单轮结果不代表生产准确率。');
  if (summary.stoppedReason || results.some((r) => r.status === 'request_error')) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(`评测未完成：${describeRequestError(error)}`);
  process.exitCode = 1;
}
