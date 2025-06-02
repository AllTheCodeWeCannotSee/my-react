import { Props, Key, Ref, ReactElementType, Wakeable } from 'shared/ReactTypes';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	OffscreenComponent,
	SuspenseComponent,
	WorkTag,
	MemoComponent
} from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';
import { CallbackNode } from 'scheduler';
import {
	REACT_PROVIDER_TYPE,
	REACT_SUSPENSE_TYPE,
	REACT_MEMO_TYPE
} from 'shared/ReactSymbols';

import { ContextItem } from './fiberContext';

/**
 * @interface FiberDependencies
 * @description 存储一个 Fiber 节点所依赖的 Context 列表以及与这些依赖相关的 Lanes。
 *              当一个组件通过 `useContext` 消费 Context 时，如果 Context 的值发生变化，
 *              React 需要知道哪些 Fiber 节点依赖了这个 Context，以便重新调度它们进行更新。
 *              这个接口的实例通常存储在 Fiber 节点的 `dependencies` 属性上。
 *
 * @template Value - Context 所持有的值的类型。
 * @property {ContextItem<Value> | null} firstContext - 指向该 Fiber 节点所消费的 Context 链表中的第一个 ContextItem。
 *                                                      每个 ContextItem 代表一个被消费的 Context 及其在该 Fiber 中的值。
 * @property {Lanes} lanes - 一个 Lanes 位掩码，表示与此 Fiber 节点的 Context 依赖相关的更新优先级。
 *                           当依赖的 Context 值发生变化时，会使用这些 Lanes 来调度更新。
 */
interface FiberDependencies<Value> {
	firstContext: ContextItem<Value> | null;
	lanes: Lanes;
}

/**
 * @class FiberNode
 * @description 表示 React 内部工作单元的核心数据结构。
 *              每个 FiberNode 对应于一个组件实例、DOM 元素、Fragment 或其他 React 结构。
 *              Fiber 树是 React 用来管理组件状态、props、更新和副作用的内部表示。
 *              它支持增量渲染和并发模式。
 *
 * @property {any} type - Fiber 节点的类型。
 *                        - 对于类组件，是组件的构造函数。
 *                        - 对于函数组件，是组件函数本身。
 *                        - 对于宿主组件 (DOM 元素)，是标签名字符串 (如 'div')。
 *                        - 对于 Fragment 等，是特殊的 Symbol。
 * @property {WorkTag} tag - 标识 Fiber 节点具体类型的数字标签 (如 FunctionComponent, HostComponent)。
 * @property {Props} pendingProps - 即将在此次渲染中应用的 props。
 * @property {Key | null} key - React 元素的 key，用于优化列表协调。
 * @property {any} stateNode - 与 Fiber 节点关联的实例。
 *                             - 对于类组件，是组件实例。
 *                             - 对于宿主组件，是 DOM 元素实例。
 *                             - 对于 HostRoot，是 FiberRootNode 实例。
 *                             - 对于函数组件，通常为 null。
 * @property {Ref | null} ref - 指向组件实例或 DOM 元素的 ref。
 * @property {FiberNode | null} return - 指向父 Fiber 节点。
 * @property {FiberNode | null} sibling - 指向下一个兄弟 Fiber 节点。
 * @property {FiberNode | null} child - 指向第一个子 Fiber 节点。
 * @property {number} index - 当前 Fiber 节点在其父节点的子节点列表中的索引。
 * @property {Props | null} memoizedProps - 上一次渲染完成时应用的 props。
 * @property {any} memoizedState - 上一次渲染完成时的状态。
 *                                 - 对于类组件，是组件的 state 对象。
 *                                 - 对于函数组件，是 Hooks 链表的头节点。
 *                                 - 对于 HostRoot，是根元素 (如 `<App />`)。
 * @property {FiberNode | null} alternate - 指向与当前 Fiber 节点对应的另一棵树中的 Fiber 节点 (current 树或 work-in-progress 树)。
 * @property {Flags} flags - 描述此 Fiber 节点需要执行的副作用的位掩码 (如 Placement, Update)。
 * @property {Flags} subtreeFlags - 描述此 Fiber 节点的子树中需要执行的副作用的位掩码。
 * @property {unknown} updateQueue - 与此 Fiber 节点相关的更新队列。
 *                                   - 对于 HostRoot，存储根元素的更新。
 *                                   - 对于函数组件，存储 Hooks (特别是 useState, useEffect) 的更新队列和 Effect 链表。
 * @property {FiberNode[] | null} deletions - 一个数组，存储在此次更新中需要被删除的子 Fiber 节点。
 * @property {Lanes} lanes - 一个位掩码，表示此 Fiber 节点上待处理的更新的优先级。
 * @property {Lanes} childLanes - 一个位掩码，表示此 Fiber 节点的子树中待处理的更新的优先级。
 * @property {FiberDependencies<any> | null} dependencies - 存储此 Fiber 节点所依赖的 Context 列表及其相关 Lanes。
 *
 * @constructor
 * @param {WorkTag} tag - Fiber 节点的类型标签。
 * @param {Props} pendingProps - 初始的 props。
 * @param {Key | null} key - React 元素的 key。
 */
export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref | null;

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
	deletions: FiberNode[] | null;

	lanes: Lanes;
	childLanes: Lanes;
	dependencies: FiberDependencies<any> | null;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例
		this.tag = tag;
		this.key = key || null;
		this.stateNode = null;
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
		this.updateQueue = null;
		this.alternate = null;

		// 副作用
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null;

		this.lanes = NoLanes;
		this.childLanes = NoLanes;

		this.dependencies = null;
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
	suspendedLanes: Lanes;
	pingedLanes: Lanes;
	finishedLane: Lane; // 本次更新，消费的lane
	pendingPassiveEffects: PendingPassiveEffects;

	callbackNode: CallbackNode | null;
	callbackPriority: Lane;

	// WaekMap{Promise: Set<Lane>}
	pingCache: WeakMap<Wakeable<any>, Set<Lane>> | null;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
		this.pendingLanes = NoLanes;
		this.suspendedLanes = NoLanes;
		this.pingedLanes = NoLanes;
		this.finishedLane = NoLane;

		this.callbackNode = null;
		this.callbackPriority = NoLane;

		// 收集回调的容器
		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};
		this.pingCache = null;
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

	wip.lanes = current.lanes;
	wip.childLanes = current.childLanes;

	const currentDeps = current.dependencies;
	wip.dependencies =
		currentDeps === null
			? null
			: {
					lanes: currentDeps.lanes,
					firstContext: currentDeps.firstContext
				};

	// 5. 返回 work-in-progress FiberNode
	return wip;
};

/**
 * @function createFiberFromElement
 * @description 根据一个 React Element (`element`) 创建一个新的 FiberNode 实例。
 *              此函数会：
 *              1. 从 `element` 中解构出 `type`, `key`, `props`, 和 `ref`。
 *              2. 根据 `element.type` 的类型来确定新 FiberNode 的 `fiberTag` (WorkTag)：
 *                 - 如果 `type` 是字符串 (如 'div')，则 `fiberTag` 为 `HostComponent`。
 *                 - 如果 `type` 是一个对象，则检查其 `$$typeof` 属性：
 *                   - 如果是 `REACT_PROVIDER_TYPE`，则 `fiberTag` 为 `ContextProvider`。
 *                   - 如果是 `REACT_MEMO_TYPE`，则 `fiberTag` 为 `MemoComponent`。
 *                   - 其他对象类型会触发开发环境下的警告。
 *                 - 如果 `type` 是 `REACT_SUSPENSE_TYPE` (Symbol)，则 `fiberTag` 为 `SuspenseComponent`。
 *                 - 如果 `type` 是函数 (默认情况)，则 `fiberTag` 为 `FunctionComponent`。
 *                 - 其他未识别的 `type` 会触发开发环境下的警告。
 *              3. 使用确定的 `fiberTag`、`props` 和 `key` 创建一个新的 `FiberNode` 实例。
 *              4. 将 `element.type` 赋值给 `fiber.type`，并将 `element.ref` 赋值给 `fiber.ref`。
 * @param {ReactElementType} element - 用于创建 FiberNode 的 React 元素。
 * @returns {FiberNode} 返回新创建的 FiberNode 实例。
 */
export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props, ref } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// <div/> type: 'div'
		fiberTag = HostComponent;
	} else if (typeof type === 'object') {
		switch (type.$$typeof) {
			case REACT_PROVIDER_TYPE:
				fiberTag = ContextProvider;
				break;
			case REACT_MEMO_TYPE:
				fiberTag = MemoComponent;
				break;
			default:
				console.warn('未定义的type类型', element);
				break;
		}
	} else if (type === REACT_SUSPENSE_TYPE) {
		fiberTag = SuspenseComponent;
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

export interface OffscreenProps {
	mode: 'visible' | 'hidden';
	children: any;
}

export function createFiberFromOffscreen(pendingProps: OffscreenProps) {
	const fiber = new FiberNode(OffscreenComponent, pendingProps, null);
	// TODO stateNode
	return fiber;
}
