import { FiberNode } from './fiber';

const suspenseHandlerStack: FiberNode[] = [];

/**
 * @function getSuspenseHandler
 * @description 从 `suspenseHandlerStack` 栈顶获取当前的 Suspense 边界 Fiber 节点。
 *              当子组件抛出 SuspenseException 时，React 会调用此函数来找到
 *              最近的能够处理该挂起状态的 SuspenseComponent。
 *
 * @returns {FiberNode | undefined} 返回栈顶的 Suspense 边界 Fiber 节点。
 *                                  如果栈为空（即当前不在任何 Suspense 边界内部），则返回 `undefined`。
 */
export function getSuspenseHandler() {
	return suspenseHandlerStack[suspenseHandlerStack.length - 1];
}

/**
 * @function pushSuspenseHandler
 * @description 将一个 SuspenseComponent 类型的 Fiber 节点推入 `suspenseHandlerStack` 栈中。
 *              当 React 开始处理一个 SuspenseComponent 时（在 `beginWork` 阶段），
 *              会调用此函数，将其标记为当前活动的 Suspense 边界。
 *
 * @param {FiberNode} handler - 要推入栈中的 SuspenseComponent Fiber 节点。
 */
export function pushSuspenseHandler(handler: FiberNode) {
	suspenseHandlerStack.push(handler);
}

/**
 * @function popSuspenseHandler
 * @description 从 `suspenseHandlerStack` 栈顶弹出一个 Suspense 边界 Fiber 节点。
 *              当 React 完成对一个 SuspenseComponent 的处理时（在 `completeWork` 或 `unwindWork` 阶段），
 *              会调用此函数，表示该 Suspense 边界不再是当前活动的边界。
 */
export function popSuspenseHandler() {
	suspenseHandlerStack.pop();
}
