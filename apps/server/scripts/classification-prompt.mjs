// 第一课预览与真实分类请求共用同一份规则，避免两处Prompt逐渐不一致。
export function buildClassificationMessages(userInput) {
  return [
    {
      role: 'system',
      content: `你负责对企业IT工单分类。
分类标准：
- 网络与远程接入：VPN、网络连接等问题。
- 设备启动与硬件：无法开机、电源等问题。
- 待澄清：现有描述不足以判断类别，或不属于前两类。

只依据用户描述分类，不推断未经提供的故障原因。
信息明确且符合前两类时直接分类，question为null。
信息不足或不属于前两类时，分类为待澄清，question提出一个用于分诊的问题。
只输出JSON对象，包含category与question两个字段，不使用Markdown代码块。`,
    },
    { role: 'user', content: 'VPN连不上' },
    {
      role: 'assistant',
      content: JSON.stringify({ category: '网络与远程接入', question: null }),
    },
    { role: 'user', content: '电脑无法开机' },
    {
      role: 'assistant',
      content: JSON.stringify({ category: '设备启动与硬件', question: null }),
    },
    { role: 'user', content: '用不了了，帮我看看' },
    {
      role: 'assistant',
      content: JSON.stringify({
        category: '待澄清',
        question: '具体是哪个设备或软件无法使用？',
      }),
    },
    { role: 'user', content: userInput },
  ];
}
