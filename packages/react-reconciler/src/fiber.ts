import { Props, Key, Ref, ReactElementType } from 'shared/ReactTypes';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	WorkTag
} from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';
import { CallbackNode } from 'scheduler';

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	memoizedState: any;
	alternate: FiberNode | null;
	flags: Flags;
	subtreeFlags: Flags;
	updateQueue: unknown;

	// 这个属性是一个数组，它持有那些需要从 DOM 中移除的子 FiberNode 的引用。
	deletions: FiberNode[] | null;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例
		this.tag = tag;
		this.key = key || null;

		// 对于类组件 (Class Component) Fiber 节点, stateNode 指向的是该类组件的实例
		// 对于宿主组件 (Host Component) Fiber 节点, stateNode 指向的是该 Fiber 节点对应的真实 DOM 元素
		// 对于函数组件 (Function Component) Fiber 节点, 在现代 React (特别是引入 Hooks 之后)，函数组件本身没有实例。因此，对于函数组件的 Fiber 节点，stateNode 通常是 null。函数组件的状态和副作用是通过 Hooks 来管理的，这些信息存储在 Fiber 节点的其他属性上（如 memoizedState，用于存储 Hooks 的链表）。
		// 对于宿主根节点 (Host Root) Fiber 节点, stateNode 指向的是 FiberRoot 对象
		// 对于宿主文本节点 (Host Text) Fiber 节点, stateNode 指向的是该文本对应的真实 DOM 文本节点 (Text Node)
		this.stateNode = null;

		// 对于类组件 (Class Component) Fiber 节点：
		// type 指向的是该类组件的构造函数 (constructor) 本身。例如，如果你定义了一个组件 class MyComponent extends React.Component {...}，那么代表 <MyComponent /> 的 Fiber 节点的 type 就是 MyComponent 这个类。
		// 对于函数组件 (Function Component) Fiber 节点：
		// type 指向的是该函数组件本身。例如，如果你定义了一个组件 function MyFunctionComponent() {...} 或者 const MyFunctionComponent = () => {...}，那么代表 <MyFunctionComponent /> 的 Fiber 节点的 type 就是 MyFunctionComponent 这个函数。
		// 对于宿主组件 (Host Component) Fiber 节点 (例如 <div>, <span>, <p> 等原生 DOM 元素)：
		// type 是一个字符串，表示该 DOM 元素的标签名。例如，对于一个 <div> 元素，其 Fiber 节点的 type 就是字符串 "div"。
		// 对于原生 React 元素，如 Fragment、Profiler、StrictMode、Suspense、ContextProvider、ContextConsumer 等：
		// type 通常是 React 内部定义的特殊 Symbol 值或者对象，用来标识这些特定的 React 结构。例如，Fragment 的 type 是 REACT_FRAGMENT_TYPE 这个 Symbol。
		// 对于宿主文本节点 (Host Text) Fiber 节点：
		// 文本节点没有 type 属性，因为它们的内容直接存储在 pendingProps (或 memoizedProps) 中。通常，React 会根据父组件的 children 来创建文本节点。
		this.type = null;

		// 构成树状结构
		this.return = null;
		this.sibling = null;
		this.child = null;
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		this.pendingProps = pendingProps; // pendingProps 指的是组件从 React 元素（即 JSX 中定义的）接收到的，即将要应用的 props
		this.memoizedProps = null; // memoizedProps 指的是在上一次渲染（render）过程中，组件最终实际使用的 props
		this.memoizedState = null;

		// 对于 HostRoot Fiber:
		// 是 UpdateQueue<ReactElementType | null> 类型的实例，
		// 这个队列的 shared.pending 属性会持有一个循环链表，
		// 链表中的每个节点是一个 Update 对象，
		// 每个 Update 对象的 payload 就是要渲染到根节点的 React 元素（例如 <App />）或者 null（用于卸载）。

		// 对于 FunctionComponent Fiber:
		// 用来存储一个 FCUpdateQueue 对象
		this.updateQueue = null;
		this.alternate = null;

		// 副作用
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null;
	}
}

/**
 * @interface PendingPassiveEffects
 * @description 定义一个对象的结构，用于临时存储在一次 React 渲染和提交周期中，
 *              所有待处理的“被动副作用”（Passive Effects）。
 *              被动副作用主要指的是通过 `useEffect` Hook 注册的创建回调和销毁回调。
 *              这些副作用被设计为在浏览器完成所有 DOM 更新和绘制之后异步执行。
 *
 * @property {Effect[]} unmount - 一个数组，用于收集所有在当前提交周期中，
 *                                由于组件卸载或 `useEffect` 依赖项变化
 *                                （导致旧的 effect 需要清理）而需要执行的销毁回调（清理函数）。
 *                                数组中的每个元素通常是 `Effect` 循环链表的最后一个节点。
 *
 * @property {Effect[]} update - 一个数组，用于收集所有在当前提交周期中，
 *                               由于组件首次挂载或 `useEffect` 依赖项变化
 *                               而需要执行的创建回调。
 *                               数组中的每个元素通常是 `Effect` 循环链表的最后一个节点。
 */
export interface PendingPassiveEffects {
	unmount: Effect[];
	update: Effect[];
}

// FiberRootNode 是 React 应用中所有 Fiber 节点的根，它代表了整个应用的实例
export class FiberRootNode {
	// container 指的是承载整个 React 应用的实际 DOM 元素。
	container: Container;
	current: FiberNode;
	finishedWork: FiberNode | null;
	pendingLanes: Lanes;
	finishedLane: Lane; // 本次更新，消费的lane
	pendingPassiveEffects: PendingPassiveEffects;

	callbackNode: CallbackNode | null;
	callbackPriority: Lane;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.finishedLane = NoLane;

		this.callbackNode = null;
		this.callbackPriority = NoLane;

		// 收集回调的容器
		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};
	}
}

/**
 *
 * @description 负责创建或复用一个与 current Fiber 节点相对应的 wip Fiber 节点
 * @param current current node，来自当前已渲染树的 FiberNode
 * @param pendingProps 新 props
 * @returns {FiberNode}
 * * 类型：wip fibernode
 * * 结构：
 * 	* 实例(tag, key, stateNode, type)：赋值，数据来自 current
 * 	* 树状结构（return, sibling, child, index）：null
 * 	* 工作单元(pendingProps, memoizedProps, memoizedState, updateQueue, alternate)：赋值，数据来自 current & pendingProps
 * 	* 副作用(flags, subtreeFlags, deletions)：重置
 */
export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	// 1. 尝试获取 alternate (如果存在的话，它是上一个渲染周期中的 wip 节点)
	let wip = current.alternate;

	// 2. 处理 "mount" 情况 (这个 Fiber 首次在 wip 树中被处理，或者没有 alternate 存在)
	if (wip === null) {
		// mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;

		wip.alternate = current;
		current.alternate = wip;
		// 3. 处理 "update" 情况 (一个 alternate/wip 节点已经存在，所以我们复用它)
	} else {
		// update
		wip.pendingProps = pendingProps;
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}

	// 4. mount 和 update 情况下都会复制/设置的通用属性：
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;
	wip.ref = current.ref;

	// 5. 返回 work-in-progress FiberNode
	return wip;
};

/**
 * @description 根据一个 React Element 创建一个新的 FiberNode 实例。
 * @param element
 * @returns
 */
export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props, ref } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// <div/> type: 'div'
		fiberTag = HostComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('为定义的type类型', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	fiber.ref = ref;
	return fiber;
}

export function createFiberFromFragment(elements: any[], key: Key): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}
