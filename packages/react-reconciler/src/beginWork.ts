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
	SuspenseComponent,
	MemoComponent
} from './workTags';

import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { bailoutHook, renderWithHooks } from './fiberHooks';
import { Lane, NoLanes, includeSomeLanes } from './fiberLanes';
import {
	Ref,
	NoFlags,
	DidCapture,
	Placement,
	ChildDeletion
} from './fiberFlags';
import {
	prepareToReadContext,
	propagateContextChange,
	pushProvider
} from './fiberContext';
import { pushSuspenseHandler } from './suspenseContext';
import { cloneChildFibers } from './childFibers';
import { shallowEqual } from 'shared/shallowEquals';

// 是否能命中bailout
/**
 * @description 一个模块级变量，用于在 `beginWork` 阶段追踪当前处理的 Fiber 节点是否接收到了更新。
 *              在 `beginWork` 开始时被重置为 `false`。
 *              如果 Fiber 节点的 props、type 发生变化，或者其 state、context 发生变化并导致需要重新渲染，
 *              此变量会被 `markWipReceivedUpdate` 函数设置为 `true`。
 *              它主要用于 bailout 优化：如果 `didReceiveUpdate` 为 `false` 且其他条件满足，
 *              React 可能会跳过对该 Fiber 节点及其子树的实际渲染工作。
 */
let didReceiveUpdate = false;

/**
 * @function markWipReceivedUpdate
 * @description 将模块级变量 `didReceiveUpdate` 设置为 `true`。
 *              此函数在 `beginWork` 阶段被调用，当检测到当前处理的 work-in-progress Fiber 节点
 *              确实接收到了需要处理的更新时（例如，props 变化、state 更新或 context 变化导致需要重新渲染）。
 * @see {@link didReceiveUpdate} - 相关的模块级变量。
 */
export function markWipReceivedUpdate() {
	didReceiveUpdate = true;
}

/**
 * @function beginWork
 * @description "begin" 或 "render" 阶段的核心函数。对于给定的 work-in-progress (WIP) Fiber 节点，
 *              此函数负责：
 *              1. **Bailout 优化**: 检查是否可以跳过当前 Fiber 节点的渲染工作。
 *                 这基于 props、type、state 和 context 的变化，以及当前 `renderLane`。
 *                 如果可以 bailout，可能会复用之前的子节点或直接返回 `null`。
 *                 `didReceiveUpdate` 模块级变量会根据此检查结果被设置。
 *              2. **处理 Fiber 节点**: 如果不能 bailout，则根据 `wip.tag` (Fiber 类型) 执行特定逻辑：
 *                 - 对于组件类型 (FunctionComponent, HostRoot, MemoComponent, ContextProvider, SuspenseComponent)，
 *                   通常会计算新的 state/value，执行组件函数 (对于 FunctionComponent)，
 *                   并获取其子 React 元素。
 *                 - 对于宿主类型 (HostComponent, HostText)，主要是准备处理其子节点。
 *                 - 特殊处理包括 ContextProvider 的值推送和变化传播，SuspenseComponent 的挂起逻辑等。
 *              3. **协调子节点**: 调用 `reconcileChildren` (或 `mountChildFibers`)
 *                 来比较新的子 React 元素与旧的子 Fiber 节点，生成新的子 WIP Fiber 节点链表。
 *              4. **返回下一个工作单元**: 返回下一个要处理的 Fiber 节点，通常是 `wip.child`
 *                 (当前 WIP 节点的第一个子节点)。如果当前节点没有子节点或其 begin 阶段工作已完成
 *                 (例如 HostText)，则返回 `null`。
 *
 * @param {FiberNode} wip - 当前正在处理的 work-in-progress Fiber 节点。
 * @param {Lane} renderLane - 当前渲染工作的优先级 Lane。
 * @returns {FiberNode | null} 返回下一个要处理的 Fiber 节点 (通常是 `wip` 的第一个子节点)，
 *                             或者 `null` (如果当前节点没有子节点或其 begin 阶段工作已完成)。
 */
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
	// bailoyt 策略

	didReceiveUpdate = false;
	const current = wip.alternate;

	if (current !== null) {
		const oldProps = current.memoizedProps;
		const newProps = wip.pendingProps;
		// 四要素～ props type
		// {num: 0, name: 'cpn2'}
		// {num: 0, name: 'cpn2'}
		if (oldProps !== newProps || current.type !== wip.type) {
			didReceiveUpdate = true;
		} else {
			// state context
			const hasScheduledStateOrContext = checkScheduledUpdateOrContext(
				current,
				renderLane
			);
			if (!hasScheduledStateOrContext) {
				// 四要素～ state context
				// 命中bailout
				didReceiveUpdate = false;

				switch (wip.tag) {
					case ContextProvider:
						const newValue = wip.memoizedProps.value;
						const context = wip.type._context;
						pushProvider(context, newValue);
						break;
					// TODO Suspense
				}

				return bailoutOnAlreadyFinishedWork(wip, renderLane);
			}
		}
	}

	wip.lanes = NoLanes;
	// 比较，返回子fiberNode
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip, renderLane);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip, wip.type, renderLane);
		case Fragment:
			return updateFragment(wip);
		case ContextProvider:
			return updateContextProvider(wip, renderLane);
		case SuspenseComponent:
			return updateSuspenseComponent(wip);
		case OffscreenComponent:
			return updateOffscreenComponent(wip);
		case MemoComponent:
			return updateMemoComponent(wip, renderLane);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};

/**
 * @function updateMemoComponent
 * @description 处理 `MemoComponent` 类型的 Fiber 节点的 `beginWork` 逻辑。
 *              `MemoComponent` 是通过 `React.memo` 包装的组件。此函数的核心在于实现 props 比较和 bailout 优化。
 *              1. **Props 比较**:
 *                 - 如果存在 `current` (上一次渲染的 Fiber) 节点，它会比较 `current.memoizedProps` 和 `wip.pendingProps`。
 *                 - 比较默认使用 `shallowEqual`。如果 `React.memo` 提供了自定义的 `compare` 函数，则使用该函数。
 *                 - 同时也会比较 `ref` 是否发生变化。
 *              2. **Bailout 判断**:
 *                 - 如果 props (根据比较函数) 和 `ref` 均未改变，则将全局的 `didReceiveUpdate` 标记为 `false`。
 *                 - 接着，调用 `checkScheduledUpdateOrContext` 检查当前 `renderLane` 下是否有待处理的 state 更新或 context 变化。
 *                 - 如果以上所有条件都满足（props 未变、ref 未变、无相关 state/context 更新），则调用 `bailoutOnAlreadyFinishedWork`
 *                   尝试跳过此组件及其子树的渲染。
 *              3. **继续更新**:
 *                 - 如果不满足 bailout 条件（例如 props 变化，或有相关的 state/context 更新），
 *                   则调用 `updateFunctionComponent` 来处理其内部包裹的实际函数组件 (`wip.type.type`)。
 *
 * @param {FiberNode} wip - 当前正在处理的 MemoComponent 类型的 work-in-progress Fiber 节点。
 * @param {Lane} renderLane - 当前渲染工作的优先级 Lane。
 * @returns {FiberNode | null} 返回下一个要处理的 Fiber 节点 (通常是 `wip` 的第一个子节点，
 *                             如果 bailout 则可能为 `null` 或克隆的子节点)。
 * @see {@link shallowEqual} - 默认的 props 比较函数。
 * @see {@link updateFunctionComponent} - 用于处理内部函数组件的函数。
 */
function updateMemoComponent(wip: FiberNode, renderLane: Lane) {
	// bailout四要素
	// props浅比较
	const current = wip.alternate;
	const nextProps = wip.pendingProps;
	const Component = wip.type.type;

	if (current !== null) {
		const prevProps = current.memoizedProps;

		// 浅比较props
		if (shallowEqual(prevProps, nextProps) && current.ref === wip.ref) {
			didReceiveUpdate = false;
			wip.pendingProps = prevProps;

			// state context
			if (!checkScheduledUpdateOrContext(current, renderLane)) {
				// 满足四要素
				wip.lanes = current.lanes;
				return bailoutOnAlreadyFinishedWork(wip, renderLane);
			}
		}
	}
	return updateFunctionComponent(wip, Component, renderLane);
}

/**
 * @function bailoutOnAlreadyFinishedWork
 * @description 当一个 Fiber 节点 (wip) 自身没有接收到更新 (didReceiveUpdate is false)
 *              并且其 lanes 属性不包含当前的 renderLane 时，会调用此函数尝试进行 bailout 优化。
 *              它检查 `wip.childLanes` 是否包含 `renderLane`：
 *              - 如果不包含，意味着该 Fiber 节点的整个子树在当前 `renderLane` 下也没有待处理的工作，
 *                因此可以安全地跳过 (bailout) 对整个子树的处理，函数返回 `null`。
 *              - 如果包含，意味着虽然当前 Fiber 节点自身不需要重新渲染，但其子树中可能存在
 *                需要在当前 `renderLane` 下处理的更新。此时，会调用 `cloneChildFibers`
 *                来复用（克隆）旧的子 Fiber 节点作为新的 work-in-progress 子节点，
 *                然后返回 `wip.child`，以便渲染工作可以继续向下遍历到子节点。
 * @param {FiberNode} wip - 当前正在处理的 work-in-progress Fiber 节点，它是 bailout 的候选者。
 * @param {Lane} renderLane - 当前渲染工作的优先级 Lane。
 * @returns {FiberNode | null} 如果子树中存在待处理工作，则返回克隆后的第一个子 Fiber 节点 (`wip.child`)；
 *                             如果整个子树都可以 bailout，则返回 `null`。
 */
function bailoutOnAlreadyFinishedWork(wip: FiberNode, renderLane: Lane) {
	if (!includeSomeLanes(wip.childLanes, renderLane)) {
		if (__DEV__) {
			console.warn('bailout整棵子树', wip);
		}
		return null;
	}

	if (__DEV__) {
		console.warn('bailout一个fiber', wip);
	}
	cloneChildFibers(wip);
	return wip.child;
}

/**
 * @function checkScheduledUpdateOrContext
 * @description 检查一个 Fiber 节点 (current) 是否有与当前渲染优先级 (renderLane) 相关的待处理更新或 context 变化。
 *              这是 bailout 优化策略的一部分，用于判断 Fiber 节点是否因为自身的状态更新或消费的 context 变化而需要重新渲染。
 *
 * @param {FiberNode} current - 上一次渲染完成的 Fiber 节点 (current tree)。
 *                              其 `lanes` 属性包含了该 Fiber 节点上所有待处理更新的优先级。
 * @param {Lane} renderLane - 当前渲染工作的优先级 Lane。
 * @returns {boolean} 如果 `current.lanes` 中包含 `renderLane` (即存在与当前渲染优先级匹配的待处理更新)，
 *                    则返回 `true`，表示该 Fiber 节点需要处理更新。否则返回 `false`。
 */
function checkScheduledUpdateOrContext(
	current: FiberNode,
	renderLane: Lane
): boolean {
	const updateLanes = current.lanes;
	if (includeSomeLanes(updateLanes, renderLane)) {
		return true;
	}
	return false;
}

function updateContextProvider(wip: FiberNode, renderLane: Lane) {
	// {
	// 		$$typeof: REACT_PROVIDER_TYPE,
	// 		_context: context
	// 	};
	const providerType = wip.type;
	const context = providerType._context;
	const newProps = wip.pendingProps;
	const oldProps = wip.memoizedProps;
	const newValue = newProps.value;

	pushProvider(context, newValue);

	if (oldProps !== null) {
		const oldValue = oldProps.value;

		if (
			Object.is(oldValue, newValue) &&
			oldProps.children === newProps.children
		) {
			return bailoutOnAlreadyFinishedWork(wip, renderLane);
		} else {
			propagateContextChange(wip, context, renderLane);
		}
	}

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
 * @function updateFunctionComponent
 * @description 在 begin/render 阶段处理 FunctionComponent 类型的 Fiber 节点。
 *              此函数负责：
 *              1. 调用 `prepareToReadContext`，为读取当前 Fiber 节点的 context 做准备。
 *              2. 调用 `renderWithHooks` 来执行函数组件本身。`renderWithHooks` 会处理组件内部所有 Hooks 的执行，
 *                 并返回该组件渲染出的子 React 元素 (`nextChildren`)。
 *                 `renderWithHooks` 也会间接影响 `didReceiveUpdate` 标记（如果 props、state 或 context 发生变化）。
 *              3. 检查 bailout 条件：如果 `renderWithHooks` 执行后 `didReceiveUpdate` 为 `false`
 *                 （意味着与当前 `renderLane` 相关的 props、由 Hooks 管理的 state 以及 context 均未发生
 *                 需要重新渲染的变化），则尝试通过 `bailoutHook` 和 `bailoutOnAlreadyFinishedWork`
 *                 来跳过当前组件及其子树的渲染。
 *              4. 如果没有 bailout，则调用 `reconcileChildren` 来协调从组件执行得到的 `nextChildren`，
 *                 生成新的子 work-in-progress Fiber 节点。
 *
 * @param {FiberNode} wip - 当前正在处理的 FunctionComponent 类型的 work-in-progress Fiber 节点。
 * @param {FiberNode['type']} Component - 函数组件的实际类型（即函数本身）。
 * @param {Lane} renderLane - 当前渲染工作的优先级 Lane。
 * @returns {FiberNode | null} 返回下一个要处理的 Fiber 节点（通常是 `wip` 的第一个子节点），或者在 bailout 或没有子节点时返回 `null`。
 */
function updateFunctionComponent(
	wip: FiberNode,
	Component: FiberNode['type'],
	renderLane: Lane
) {
	prepareToReadContext(wip, renderLane);
	// render
	const nextChildren = renderWithHooks(wip, Component, renderLane);

	const current = wip.alternate;
	if (current !== null && !didReceiveUpdate) {
		bailoutHook(wip, renderLane);
		return bailoutOnAlreadyFinishedWork(wip, renderLane);
	}

	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * @function updateHostRoot
 * @description 处理 HostRoot 类型的 Fiber 节点的 `beginWork` 逻辑。
 *              HostRoot Fiber 代表整个 React 应用的根。此函数的主要职责是：
 *              1. 从 `wip.updateQueue` (HostRoot 的更新队列) 中处理待处理的更新。
 *                 这些更新通常是由 `ReactDOM.render` 或后续的 `setState` 调用触发的，
 *                 它们包含了新的 React 元素 (应用的根组件)。
 *              2. 调用 `processUpdateQueue` 来计算新的 `memoizedState`。
 *                 对于 HostRoot，`memoizedState` 存储的是其子 React 元素。
 *              3. 检查是否可以进行 bailout 优化：如果新的子元素与旧的子元素相同，
 *                 则调用 `bailoutOnAlreadyFinishedWork` 尝试跳过子节点的处理。
 *              4. 如果不能 bailout，则调用 `reconcileChildren` 来协调新的子 React 元素，
 *                 生成新的子 work-in-progress Fiber 节点。
 * @param {FiberNode} wip - 当前正在处理的 HostRoot 类型的 work-in-progress Fiber 节点。
 * @param {Lane} renderLane - 当前渲染工作的优先级 Lane。
 * @returns {FiberNode | null} 返回下一个要处理的 Fiber 节点 (即 HostRoot 的第一个子节点)，或者在 bailout 时返回 `null`。
 */
function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	updateQueue.shared.pending = null;
	const prevChildren = wip.memoizedState;

	// memoizedState：当前的hostRoot的最新的状态
	const { memoizedState } = processUpdateQueue(baseState, pending, renderLane);
	wip.memoizedState = memoizedState;

	const current = wip.alternate;
	// 考虑RootDidNotComplete的情况，需要复用memoizedState
	if (current !== null) {
		if (!current.memoizedState) {
			current.memoizedState = memoizedState;
		}
	}

	// nextChildren: 子节点的reactElement
	const nextChildren = wip.memoizedState;
	if (prevChildren === nextChildren) {
		return bailoutOnAlreadyFinishedWork(wip, renderLane);
	}
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
 * @function reconcileChildren
 * @description 协调给定 work-in-progress (WIP) Fiber 节点的子节点。
 *              此函数作为调度器，根据当前 WIP 节点是处于挂载阶段还是更新阶段，
 *              来调用相应的子节点协调逻辑 (`mountChildFibers` 或 `reconcileChildFibers`)。
 *              协调过程会比较新的子 React 元素 (`children`) 与旧的子 Fiber 节点 (如果存在)，
 *              并生成新的子 WIP Fiber 节点链表。
 *              这个新的子 Fiber 链表的头节点会被赋值给 `wip.child`。
 *
 * @param {FiberNode} wip - 当前正在处理的父 work-in-progress Fiber 节点。
 * @param {ReactElementType | undefined} children - 父节点的新子 React 元素。
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
