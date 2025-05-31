import { ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	createFiberFromFragment,
	createWorkInProgress,
	createFiberFromOffscreen,
	OffscreenProps
} from './fiber';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	OffscreenComponent,
	SuspenseComponent
} from './workTags';

import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';
import { Lane } from './fiberLanes';
import {
	Ref,
	NoFlags,
	DidCapture,
	Placement,
	ChildDeletion
} from './fiberFlags';
import { pushProvider } from './fiberContext';
import { pushSuspenseHandler } from './suspenseContext';

// 递归中的递阶段 (这个注释准确地描述了 beginWork 的角色)
/**
 * @description "递"阶段的入口函数。根据 Fiber 节点的类型，
 *              执行相应的更新逻辑，协调其子节点，并返回下一个要处理的 Fiber 节点。
 * @param wip 当前正在处理的 work-in-progress Fiber 节点。
 * @param renderLane 当前渲染的优先级。
 * @returns 返回下一个要处理的 Fiber 节点 (通常是 wip 的第一个子节点)，或者 null。
 */
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip, renderLane);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip, renderLane);
		case Fragment:
			return updateFragment(wip);
		case ContextProvider:
			return updateContextProvider(wip);
		case SuspenseComponent:
			return updateSuspenseComponent(wip);
		case OffscreenComponent:
			return updateOffscreenComponent(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};

function updateContextProvider(wip: FiberNode) {
	// {
	// 		$$typeof: REACT_PROVIDER_TYPE,
	// 		_context: context
	// 	};
	const providerType = wip.type;
	const context = providerType._context;
	const newProps = wip.pendingProps;

	pushProvider(context, newProps.value);

	const nextChildren = newProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * @description 处理 Fragment 类型的 Fiber 节点
 * @param wip 父节点
 * @returns 返回协调后产生的第一个子 Fiber 节点
 */
function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * @description 处理 Function Component 类型的 Fiber 节点
 * @param wip 父节点
 * @returns 返回协调后产生的第一个子 Fiber 节点
 */
function updateFunctionComponent(wip: FiberNode, renderLane: Lane) {
	const nextChildren = renderWithHooks(wip, renderLane);

	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * @description 处理整个应用的根节点（即HostRoot Fiber）的更新队列
 * @param wip 父节点
 * @returns 返回协调后产生的第一个子 Fiber 节点
 */
function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	updateQueue.shared.pending = null;

	// memoizedState：当前的hostRoot的最新的状态
	const { memoizedState } = processUpdateQueue(baseState, pending, renderLane);
	wip.memoizedState = memoizedState;

	const current = wip.alternate;
	// 考虑RootDidNotComplete的情况，需要复用memoizedState
	if (current !== null) {
		current.memoizedState = memoizedState;
	}

	// nextChildren: 子节点的reactElement
	const nextChildren = wip.memoizedState;
	// 对比子节点 current fiberNode与子节点 reactElement，生成子节点对应wip fiberNode
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * @description 处理 Host Component 类型的 Fiber 节点
 * @param workInProgress 父节点
 * @returns 返回协调后产生的第一个子 Fiber 节点
 */
function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	markRef(wip.alternate, wip);

	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * @description 是一个调度函数。它根据当前父节点是首次挂载还是更新，来调用两个专门的子节点协调函数之一，最终的结果是，wip.child 会指向其新协调好的子 Fiber 节点链表的头部
 * @param wip wip父节点
 * @param children 子节点 reactElement
 */
function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	const current = wip.alternate;

	if (current !== null) {
		// update
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		// mount
		wip.child = mountChildFibers(wip, null, children);
	}
}

/**
 * @function markRef
 * @description 检查一个 Fiber 节点的 ref 是否需要被处理（例如，在 commit 阶段进行附加或分离）。
 *              如果 ref 是新的（在挂载时）或者在更新时发生了变化，
 *              则会给 work-in-progress Fiber 节点打上 `Ref` 标记。
 *
 * @param {FiberNode | null} current - 当前 Fiber 节点（来自上一次渲染的树）。
 *                                     如果是首次挂载，则为 `null`。
 * @param {FiberNode} workInProgress - 正在处理的 work-in-progress Fiber 节点。
 */

function markRef(current: FiberNode | null, workInProgress: FiberNode) {
	const ref = workInProgress.ref;

	if (
		(current === null && ref !== null) ||
		(current !== null && current.ref !== ref)
	) {
		workInProgress.flags |= Ref;
	}
}

function updateOffscreenComponent(workInProgress: FiberNode) {
	const nextProps = workInProgress.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(workInProgress, nextChildren);
	return workInProgress.child;
}

/**
 * @function updateSuspenseComponent
 * @description 处理 SuspenseComponent 类型的 Fiber 节点的更新逻辑。
 *              它会根据当前 Suspense 组件是否处于挂起状态 (didSuspend)
 *              以及是首次挂载还是更新，来决定是渲染主内容 (primaryChildren)
 *              还是后备内容 (fallbackChildren)。
 *              它还会将当前 Suspense 组件推入 suspenseHandlerStack，以便在子组件抛出
 *              SuspenseException 时能够找到对应的 Suspense 边界。
 *
 * @param {FiberNode} workInProgress - 当前正在处理的 SuspenseComponent 类型的 work-in-progress Fiber 节点。
 * @returns {FiberNode | null} 返回下一个要处理的 Fiber 节点，通常是主内容或后备内容的根 Fiber 节点。
 */
function updateSuspenseComponent(workInProgress: FiberNode) {
	const current = workInProgress.alternate;
	const nextProps = workInProgress.pendingProps;

	let showFallback = false;
	const didSuspend = (workInProgress.flags & DidCapture) !== NoFlags;

	if (didSuspend) {
		showFallback = true;
		workInProgress.flags &= ~DidCapture;
	}

	// <Cpn />
	const nextPrimaryChildren = nextProps.children;

	// fallback属性
	const nextFallbackChildren = nextProps.fallback;
	pushSuspenseHandler(workInProgress);

	if (current === null) {
		// mount
		if (showFallback) {
			// 挂起
			return mountSuspenseFallbackChildren(
				workInProgress,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			// 正常
			return mountSuspensePrimaryChildren(workInProgress, nextPrimaryChildren);
		}
	} else {
		// update
		if (showFallback) {
			// 挂起
			return updateSuspenseFallbackChildren(
				workInProgress,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			// 正常
			return updateSuspensePrimaryChildren(workInProgress, nextPrimaryChildren);
		}
	}
}

/**
 * @function mountSuspensePrimaryChildren
 * @description 在 Suspense 组件首次挂载且未处于挂起状态时，
 *              仅挂载主内容 (primaryChildren)。
 *              主内容会被包裹在一个 mode 为 'visible' 的 OffscreenComponent 中。
 *
 * @param {FiberNode} workInProgress - 当前正在处理的 SuspenseComponent 类型的 work-in-progress Fiber 节点。
 * @param {any} primaryChildren - Suspense 组件的主内容 (React 元素)。
 * @returns {FiberNode} 返回主内容的 OffscreenComponent Fiber 节点，这将是下一个要处理的工作单元。
 */
function mountSuspensePrimaryChildren(
	workInProgress: FiberNode,
	primaryChildren: any
) {
	const primaryChildProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
	workInProgress.child = primaryChildFragment;
	primaryChildFragment.return = workInProgress;
	return primaryChildFragment;
}

/**
 * @function mountSuspenseFallbackChildren
 * @description 在 Suspense 组件首次挂载且处于挂起状态时，
 *              同时挂载主内容 (primaryChildren) 和后备内容 (fallbackChildren)。
 *              主内容会被包裹在一个 mode 为 'hidden' 的 OffscreenComponent 中，
 *              而后备内容则正常挂载。
 *              后备内容 Fiber 节点会被标记为 `Placement`，因为它需要被插入到 DOM 中。
 *
 * @param {FiberNode} workInProgress - 当前正在处理的 SuspenseComponent 类型的 work-in-progress Fiber 节点。
 * @param {any} primaryChildren - Suspense 组件的主内容 (React 元素)。
 * @param {any} fallbackChildren - Suspense 组件的后备 UI (React 元素)。
 * @returns {FiberNode} 返回后备内容的 Fiber 节点，这将是下一个要处理的工作单元。
 */

function mountSuspenseFallbackChildren(
	workInProgress: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const primaryChildProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};
	const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
	const fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);

	// 父组件Suspense已经mount，所以需要fallback标记Placement
	fallbackChildFragment.flags |= Placement;

	// 树的结构 Suspense -> Offscreen -> Fragment
	primaryChildFragment.return = workInProgress;
	fallbackChildFragment.return = workInProgress;
	primaryChildFragment.sibling = fallbackChildFragment;
	workInProgress.child = primaryChildFragment;

	return fallbackChildFragment;
}

/**
 * @function updateSuspensePrimaryChildren
 * @description 在 Suspense 组件更新且未处于挂起状态时，
 *              仅更新主内容 (primaryChildren)。
 *              主内容会被包裹在一个 mode 为 'visible' 的 OffscreenComponent 中。
 *              如果之前渲染了后备内容 (fallbackChildren)，则会将其标记为删除。
 *
 * @param {FiberNode} workInProgress - 当前正在处理的 SuspenseComponent 类型的 work-in-progress Fiber 节点。
 * @param {any} primaryChildren - Suspense 组件的主内容 (React 元素)。
 * @returns {FiberNode} 返回主内容的 OffscreenComponent Fiber 节点，这将是下一个要处理的工作单元。
 */
function updateSuspensePrimaryChildren(
	workInProgress: FiberNode,
	primaryChildren: any
) {
	const current = workInProgress.alternate as FiberNode;
	const currentPrimaryChildFragment = current.child as FiberNode;
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;

	const primaryChildProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};

	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	primaryChildFragment.return = workInProgress;
	primaryChildFragment.sibling = null;
	workInProgress.child = primaryChildFragment;

	if (currentFallbackChildFragment !== null) {
		const deletions = workInProgress.deletions;
		if (deletions === null) {
			workInProgress.deletions = [currentFallbackChildFragment];
			workInProgress.flags |= ChildDeletion;
		} else {
			deletions.push(currentFallbackChildFragment);
		}
	}

	return primaryChildFragment;
}

/**
 * @function updateSuspenseFallbackChildren
 * @description 在 Suspense 组件更新且处于挂起状态时，
 *              同时更新主内容 (primaryChildren) 和后备内容 (fallbackChildren)。
 *              主内容会被包裹在一个 mode 为 'hidden' 的 OffscreenComponent 中。
 *              如果之前没有渲染过 fallback 内容，则会为 fallback 内容创建一个新的 Fiber 节点并标记为 `Placement`；
 *              如果之前已经渲染过 fallback 内容，则会复用并更新它。
 *
 * @param {FiberNode} workInProgress - 当前正在处理的 SuspenseComponent 类型的 work-in-progress Fiber 节点。
 * @param {any} primaryChildren - Suspense 组件的主内容 (React 元素)。
 * @param {any} fallbackChildren - Suspense 组件的后备 UI (React 元素)。
 * @returns {FiberNode} 返回后备内容的 Fiber 节点，这将是下一个要处理的工作单元。
 */
function updateSuspenseFallbackChildren(
	workInProgress: FiberNode,
	primaryChildren: any,
	fallbackChildren: any
) {
	const current = workInProgress.alternate as FiberNode;
	const currentPrimaryChildFragment = current.child as FiberNode;
	const currentFallbackChildFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;

	const primaryChildProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};
	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildProps
	);
	let fallbackChildFragment;

	if (currentFallbackChildFragment !== null) {
		// 可以复用
		fallbackChildFragment = createWorkInProgress(
			currentFallbackChildFragment,
			fallbackChildren
		);
	} else {
		fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);
		fallbackChildFragment.flags |= Placement;
	}
	fallbackChildFragment.return = workInProgress;
	primaryChildFragment.return = workInProgress;
	primaryChildFragment.sibling = fallbackChildFragment;
	workInProgress.child = primaryChildFragment;

	return fallbackChildFragment;
}
