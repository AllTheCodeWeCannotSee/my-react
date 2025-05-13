import { Props, Key, Ref, ReactElementType } from 'shared/ReactTypes';
import { FunctionComponent, HostComponent, WorkTag } from './workTags';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';

export class FiberNode {
	// type
	// 对于类组件 (Class Component) Fiber 节点： type 指向的是该类组件的构造函数 (constructor) 本身
	// 对于函数组件 (Function Component) Fiber 节点： type 指向的是该函数组件本身
	// 对于宿主组件 (Host Component) Fiber 节点 (例如 <div>, <span>, <p> 等原生 DOM 元素)： type 是一个字符串，表示该 DOM 元素的标签名
	// 对于原生 React 元素，如 Fragment、Profiler、StrictMode、Suspense、ContextProvider、ContextConsumer 等： type 通常是 React 内部定义的特殊 Symbol 值或者对象，用来标识这些特定的 React 结构
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

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例
		this.tag = tag;
		this.key = key;
		// 对于类组件 (Class Component) Fiber 节点, stateNode 指向的是该类组件的实例
		// 对于宿主组件 (Host Component) Fiber 节点, stateNode 指向的是该 Fiber 节点对应的真实 DOM 元素
		// 对于函数组件 (Function Component) Fiber 节点, 在现代 React (特别是引入 Hooks 之后)，函数组件本身没有实例。因此，对于函数组件的 Fiber 节点，stateNode 通常是 null。函数组件的状态和副作用是通过 Hooks 来管理的，这些信息存储在 Fiber 节点的其他属性上（如 memoizedState，用于存储 Hooks 的链表）。
		// 对于宿主根节点 (Host Root) Fiber 节点, stateNode 指向的是 FiberRoot 对象
		// 对于宿主文本节点 (Host Text) Fiber 节点, stateNode 指向的是该文本对应的真实 DOM 文本节点 (Text Node)
		this.stateNode = null;
		//对于类组件 (Class Component) Fiber 节点：
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
		this.updateQueue = null;
		this.alternate = null;

		// 副作用
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
	}
}

// FiberRootNode 是 React 应用中所有 Fiber 节点的根，它代表了整个应用的实例
export class FiberRootNode {
	// container 指的是承载整个 React 应用的实际 DOM 元素。
	container: Container;
	current: FiberNode;
	finishedWork: FiberNode | null;
	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
	}
}

/**
 *
 * @description 输入一个fiber node，得到双缓冲树对应的node
 * @param current
 * @param pendingProps
 * @returns {FiberNode} wip，双缓冲树的另一个
 */
export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	let wip = current.alternate;

	if (wip === null) {
		// mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;

		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		wip.pendingProps = pendingProps;
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
	}
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;

	return wip;
};

export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		// <div/> type: 'div'
		fiberTag = HostComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('为定义的type类型', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	return fiber;
}
