// 第1课：用原生fetch理解一次真实模型请求。
// 已完成配置读取、检查与messages构造，尚未发送模型请求。
//
// 已完成1：从process.env读取Key、base URL和model；缺少配置时提示变量名，不输出Key。
// 已完成2：构造messages，包含分类规则、少量示例和用户问题。
// TODO 3：使用fetch POST到/chat/completions，设置请求头和JSON请求体。
// TODO 4：检查HTTP状态并解析响应；只输出答案和可用的usage字段。
// TODO 5：用三种问题验证结果，记录原始结果与预期差异。
//
// 不要在这里硬编码真实API Key，也不要输出完整请求头。

import { buildClassificationMessages } from './classification-prompt.mjs';

// npm命令中的 --env-file=.env 负责加载文件；process.env负责读取环境变量。
// trim()去掉配置值首尾不小心填入的空格，未配置时使用空字符串。
const config = {
  apiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? '',
  baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() ?? '',
  model: process.env.DEEPSEEK_MODEL?.trim() ?? '',
};

// 命令行可以传入新的问题；没有传入时，使用与示例措辞不同的问题。
// 例如：npm run learn:day01 -- "公司网络打不开网页"
const userInput = process.argv[2]?.trim() || '电脑按电源键后完全没有反应';

// 模板包含System、三个Few-shot与最后一条用户输入。
// 模板里的assistant消息是我们预先提供的示例，仍属于输入。
const messages = buildClassificationMessages(userInput);

// 检查必填值，只记录缺失的变量名，不记录或打印Key的内容。
const missingVariables = [
  ['DEEPSEEK_API_KEY', config.apiKey],
  ['DEEPSEEK_BASE_URL', config.baseUrl],
  ['DEEPSEEK_MODEL', config.model],
]
  .filter(([, value]) => value === '')
  .map(([name]) => name);

if (missingVariables.length > 0) {
  console.error(`缺少配置：${missingVariables.join('、')}。请在项目根目录的.env中填写。`);
  process.exitCode = 1;
} else {
  console.info('配置读取成功，三个必填值均非空。Key有效性尚未验证；本步骤没有发送模型请求。');
  console.info('本次消息预览（包含规则、三个示例和待回答的问题）：');
  console.info(JSON.stringify(messages, null, 2));
}
