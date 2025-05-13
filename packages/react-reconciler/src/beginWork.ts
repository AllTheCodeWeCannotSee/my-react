import { ReactElementType } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';

// 递归中的递阶段
export const beginWork = (wip: FiberNode) => {
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型');
			}
			break;
	}
	return null;
};

function updateFunctionComponent(wip: FiberNode) {
	const nextChildren = renderWithHooks(wip);
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateHostRoot(wip: FiberNode) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	updateQueue.shared.pending = null;
	// memoizedState：当前的hostRoot的最新的状态
	const { memoizedState } = processUpdateQueue(baseState, pending);
	wip.memoizedState = memoizedState;
	// nextChildren: 子节点的reactElement
	const nextChildren = wip.memoizedState;
	// 对比子节点 current fiberNode与子节点 reactElement，生成子节点对应wip fiberNode
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * @description 对比子节点 current fiberNode与子节点 reactElement，生成子节点对应wip fiberNode
 * @param wip wip父节点
 * @param children 子节点 reactElement
 * @returns 子节点 wip fiberNode
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
