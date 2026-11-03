// 校验模型答案字符串。只验证格式与字段约定，不判断分类是否符合用户原意。
export function validateClassification(content) {
  if (typeof content !== 'string') {
    throw new Error('模型答案必须是字符串。');
  }

  // 第一层：JSON语法。
  let result;
  try {
    result = JSON.parse(content);
  } catch {
    throw new Error('模型答案不是合法JSON。');
  }

  // 第二层：对象结构、必填字段、类型和允许的取值。
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('分类结果必须是JSON对象。');
  }
  const fields = Object.keys(result);
  if (fields.length !== 2 || !fields.includes('category') || !fields.includes('question')) {
    throw new Error('分类结果必须且只能包含category和question两个字段。');
  }
  const categories = ['网络与远程接入', '设备启动与硬件', '待澄清'];
  if (!categories.includes(result.category)) {
    throw new Error('category不在允许的三个类别中。');
  }
  if (result.question !== null && typeof result.question !== 'string') {
    throw new Error('question必须是字符串或null。');
  }

  // 第三层：本分类器的业务约定，不是所有工单系统的通用规则。
  if (result.category === '待澄清') {
    if (typeof result.question !== 'string' || result.question.trim() === '') {
      throw new Error('待澄清时必须提供非空的question。');
    }
  } else if (result.question !== null) {
    throw new Error('明确类别时question必须为null。');
  }

  return result;
}
