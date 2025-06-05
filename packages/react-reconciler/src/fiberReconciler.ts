import { Container } from 'hostConfig';
import {
	unstable_ImmediatePriority,
	unstable_runWithPriority
} from 'scheduler';
import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode, FiberRootNode } from './fiber';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	UpdateQueue
} from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';
import { HostRoot } from './workTags';
import { requestUpdateLane } from './fiberLanes';

/**
 * @description 创建 React 应用的根容器结构。
 *              它会创建一个 FiberRootNode (整个应用的根控制器)
 *              和一个 HostRoot FiberNode (Fiber 树的顶层节点)。
 * @param container 真实的 DOM 容器元素，React 应用将渲染到这个元素内部。
 * @returns 返回创建的 FiberRootNode 实例
 */
export function createContainer(container: Container) {
	const hostRootFiber = new FiberNode(HostRoot, {}, null);
	const root = new FiberRootNode(container, hostRootFiber);
	hostRootFiber.updateQueue = createUpdateQueue();
	return root;
}

/**
 * @function updateContainer
 * @description 触发 React 应用的渲染或更新流程。
 *              此函数是 React 渲染的入口点之一，通常在 `ReactDOM.createRoot().render()`
 *              或后续因状态变化需要重新渲染时被间接调用。
 *              它会：
 *              1. 在 `unstable_ImmediatePriority` (最高优先级) 下执行，确保更新立即被处理。
 *              2. 获取当前的 HostRoot Fiber 节点 (`root.current`)。
 *              3. 调用 `requestUpdateLane()` 来确定本次更新的优先级 Lane。
 *              4. 使用 `createUpdate()` 创建一个包含新 React 元素 (`element`) 和 Lane 的更新对象。
 *              5. 使用 `enqueueUpdate()` 将此更新对象添加到 HostRoot Fiber 的更新队列中，
 *                 并标记 HostRoot Fiber 在此 Lane 上有待处理的工作。
 *              6. 调用 `scheduleUpdateOnFiber()` 来通知调度器，HostRoot Fiber 有新的更新需要处理，
 *                 从而启动或继续渲染循环。
 *
 * @param {ReactElementType | null} element - 要渲染到容器中的 React 元素。
 *                                          通常是应用的根组件 (例如 `<App />`)。
 *                                          如果传入 `null`，通常表示卸载操作（尽管此实现未显式处理卸载逻辑）。
 * @param {FiberRootNode} root - FiberRootNode 实例，代表整个 React 应用的根。
 *                               它持有对当前 Fiber 树 (current tree) 和更新队列的引用。
 * @returns {ReactElementType | null} 返回传入的 `element`。
 *                                    这符合某些 React API 的行为，即 render 方法返回其渲染的元素。
 */
export function updateContainer(
	element: ReactElementType | null,
	root: FiberRootNode
) {
	// mount 时的更新优先级
	unstable_runWithPriority(unstable_ImmediatePriority, () => {
		const hostRootFiber = root.current;
		const lane = requestUpdateLane();
		const update = createUpdate<ReactElementType | null>(element, lane);
		enqueueUpdate(
			hostRootFiber.updateQueue as UpdateQueue<ReactElementType | null>,
			update,
			hostRootFiber,
			lane
		);
		scheduleUpdateOnFiber(hostRootFiber, lane);
	});
	return element;
}
