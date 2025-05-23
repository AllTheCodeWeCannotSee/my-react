import { Container } from 'hostConfig';
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
 * @description 触发 React 应用的渲染或更新流程。
 *              它会创建一个更新对象，将其入队到 HostRoot Fiber 的更新队列中，
 *              然后调度一次新的渲染工作。
 * @param element 要渲染的 React 元素 (例如 <App />)，或者 null (表示卸载)。
 * @param root FiberRootNode 实例，代表整个应用的根。
 * @returns 返回传入的 element (这主要用于保持 API 的一致性，实际返回值可能不常用)。
 */
export function updateContainer(
	element: ReactElementType | null,
	root: FiberRootNode
) {
	const hostRootFiber = root.current;
	const lane = requestUpdateLane();
	// element: 对应reactDOM.createRoot(root).render(<App />)中的<App />
	const update = createUpdate<ReactElementType | null>(element, lane);
	enqueueUpdate(
		hostRootFiber.updateQueue as UpdateQueue<ReactElementType | null>,
		update
	);
	scheduleUpdateOnFiber(hostRootFiber, lane);
	return element;
}
