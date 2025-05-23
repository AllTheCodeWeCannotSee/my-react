import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';
import { Lane } from './fiberLanes';

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
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};

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
	// nextChildren: 子节点的reactElement
	const nextChildren = wip.memoizedState;
	// 对比子节点 current fiberNode与子节点 reactElement，生成子节点对应wip fiberNode
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * @description 处理 Host Component 类型的 Fiber 节点
 * @param wip 父节点
 * @returns 返回协调后产生的第一个子 Fiber 节点
 */
function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
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
