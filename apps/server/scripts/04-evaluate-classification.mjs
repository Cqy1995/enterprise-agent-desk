import { validateClassification } from './classification-validator.mjs';

// 教学用固定数据：actualContent不是本次模型生成的答案。
// expectedCategory是人工标注的正确类别；actualContent是待评测输出。
const cases = [
  {
    input: 'VPN连不上',
    expectedCategory: '网络与远程接入',
    actualContent: '{"category":"网络与远程接入","question":null}',
  },
  {
    input: '电脑按电源键没有反应',
    expectedCategory: '设备启动与硬件',
    actualContent: '{"category":"设备启动与硬件","question":null}',
  },
  {
    input: '用不了，帮我看看',
    expectedCategory: '待澄清',
    actualContent: '{"category":"待澄清","question":"哪个设备或软件无法使用？"}',
  },
  {
    input: '公司网络打不开网页',
    expectedCategory: '网络与远程接入',
    actualContent: '{"category":"网络与远程接入","question":null}',
  },
  {
    input: '电脑无法开机',
    expectedCategory: '设备启动与硬件',
    actualContent: '{"category":"设备启动与硬件","question":123}',
  },
];

let validCount = 0;
let correctCount = 0;
const rows = [];

for (const example of cases) {
  let formatValid = false;
  let categoryCorrect = false;
  let actualCategory = '不可用';
  let note = '';

  try {
    // 先检查结果是否能按我们的协议使用。
    const result = validateClassification(example.actualContent);
    formatValid = true;
    validCount++;
    actualCategory = result.category;

    // 再比较实际类别与人工标注。校验通过≠分类正确。
    categoryCorrect = result.category === example.expectedCategory;
    if (categoryCorrect) correctCount++;
    note = categoryCorrect ? '输出合规且类别正确' : '输出合规，但类别错误';
  } catch (error) {
    // 不合规答案也必须留在分母中，不能删除后再计算端到端通过率。
    note = `输出不合规：${error.message}`;
  }

  rows.push({
    输入: example.input,
    预期类别: example.expectedCategory,
    实际类别: actualCategory,
    输出合规: formatValid ? '是' : '否',
    分类通过: categoryCorrect ? '是' : '否',
    说明: note,
  });
}

const total = cases.length;
console.info('本地固定输出评测：不加载Key、不调用模型，不代表DeepSeek真实准确率。');
console.table(rows);
console.info(`输出合规率：${validCount}/${total} = ${(validCount / total * 100).toFixed(0)}%`);
console.info(`端到端分类通过率：${correctCount}/${total} = ${(correctCount / total * 100).toFixed(0)}%`);
console.info('本练习定义：输出合规且类别匹配才算分类通过；两项指标的分母都是全部5条样例。');
console.info('这里只核对类别，尚未评估澄清问题是否有用，也未测稳定性、耗时或费用。');
// 本脚本是展示评测分数，不要求每条教学样例成功；有错例不自动令脚本退出失败。
