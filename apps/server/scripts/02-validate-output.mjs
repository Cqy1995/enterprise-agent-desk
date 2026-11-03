import { validateClassification } from './classification-validator.mjs';

// 全部是手动构造的本地样例，不调用模型，也不读取API Key。
const examples = [
  { name: '明确分类', content: '{"category":"设备启动与硬件","question":null}', expected: true },
  { name: '合理澄清', content: '{"category":"待澄清","question":"哪个设备出了问题？"}', expected: true },
  { name: 'JSON语法错误', content: '{category:其他}', expected: false },
  { name: '类别不在范围内', content: '{"category":"其他","question":null}', expected: false },
  { name: '字段类型错误', content: '{"category":"待澄清","question":123}', expected: false },
  { name: '待澄清却没有问题', content: '{"category":"待澄清","question":null}', expected: false },
  { name: '明确分类仍然追问', content: '{"category":"设备启动与硬件","question":"哪个软件？"}', expected: false },
  { name: '非空的question', content: '{"category":"待澄清","question": "  "}', expected: false },
];

console.info('本地校验练习，不会调用模型：');
for (const example of examples) {
  let accepted = false;
  try {
    validateClassification(example.content);
    accepted = true;
    console.info(`[接受] ${example.name}`);
  } catch (error) {
    console.info(`[拒绝] ${example.name}：${error.message}`);
  }
  if (accepted !== example.expected) {
    console.error(`校验行为不符合预期：${example.name}`);
    process.exitCode = 1;
  }
}
