# 消息 Reducer 阶段约束

App 消息 reducer 把 normalized wire message 投影为去重后的 UI 消息，按固定阶段处理：权限、事件转换、用户/文本、工具调用、工具结果、sidechain、mode event。

长期约束：重复输入必须幂等；工具调用按名称与参数匹配最新许可；工具调用优先于同批 permission placeholder；sidechain 独立存储并关联父工具；消息创建时间一旦建立不得改写。阶段顺序及这些不变量由 `reducer.spec.ts`、`phase0-skipping.spec.ts` 和 `reducerTracer.spec.ts` 覆盖。
