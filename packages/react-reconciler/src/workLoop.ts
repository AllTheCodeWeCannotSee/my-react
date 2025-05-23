import { beginWork } from './beginWork';
import { commitMutationEffects } from './commitWork';
import { completeWork } from './completeWork';
import { createWorkInProgress, FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTags';
import {
	getHighestPriorityLane,
	Lane,
	markRootFinished,
	mergeLanes,
	NoLane,
	SyncLane
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { scheduleMicroTask } from 'hostConfig';

let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;

/**
 * @description 为新的渲染或更新周期准备初始环境。
 *              它会创建一个新的 WIP Fiber 树的根，
 *              并记录当前更新的优先级。
 * @param root FiberRootNode，代表整个应用的根。
 * @param lane 本次更新的优先级。
 */
function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

/**
 * @description 当一个 Fiber 节点需要更新时，调用此函数来启动更新的调度流程。
 * @param fiber 触发更新的 Fiber 节点。
 * @param lane 本次更新的优先级。
 */
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	/**
	 * @param root fiberRootNode
	 */
	const root = markUpdateFromFiberToRoot(fiber);
	markRootUpdated(root, lane);
	ensureRootIsScheduled(root);
}

// schedule阶段入口
/**
 * @description 确保 FiberRootNode 的更新任务被调度执行。
 *              它会根据待处理更新的最高优先级，决定是同步调度还是异步调度（TODO 部分）。
 * @param root FiberRootNode，代表整个应用的根。
 */
function ensureRootIsScheduled(root: FiberRootNode) {
	const updateLane = getHighestPriorityLane(root.pendingLanes);
	if (updateLane === NoLane) {
		return;
	}

	if (updateLane === SyncLane) {
		// 同步优先级 用微任务调度
		if (__DEV__) {
			console.log('在微任务中调度，优先级：', updateLane);
		}
		// [performSyncWorkOnRoot, performSyncWorkOnRoot, performSyncWorkOnRoot]
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// TODO: 其他优先级 用宏任务调度
	}
}

/**
 * @description 将一个新的更新优先级 (lane) 合并到 FiberRootNode 的 pendingLanes 中，
 *              标记这个根节点有新的待处理更新。
 * @param root FiberRootNode，代表整个应用的根。
 * @param lane 新的更新优先级。
 */
function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}
/**
 * @description 找到这个 Fiber 节点所属的那个唯一的 FiberRootNode
 * @param fiber
 * @returns FiberRootNode
 */
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

/**
 * @description 同步更新的入口。
 * 				它负责初始化渲染环境，
 *              执行 workLoop 来构建 wip Fiber 树，
 *              并在完成后调用 commitRoot 来将变更提交到 DOM。
 * @param root FiberRootNode，代表整个应用的根。
 * @param lane 当前正在处理的同步优先级 (通常是 SyncLane)。
 */
function performSyncWorkOnRoot(root: FiberRootNode, lane: Lane) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	// 如果当前 root 上挂起的最高优先级不是 SyncLane，则重新调用 ensureRootIsScheduled 来确保正确的调度
	if (nextLane !== SyncLane) {
		// 其他比SyncLane低的优先级
		// NoLane
		ensureRootIsScheduled(root);
		return;
	}

	if (__DEV__) {
		console.warn('render阶段开始');
	}
	// 初始化
	prepareFreshStack(root, lane);

	do {
		try {
			workLoop();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop发生错误', e);
			}
			workInProgress = null;
		}
	} while (true);
	const finishedWork = root.current.alternate;
	root.finishedWork = finishedWork;
	root.finishedLane = lane;

	// 重置
	wipRootRenderLane = NoLane;

	// TODO: commitRoot
	// wip fiberNode树 树中的flags
	commitRoot(root);
}

/**
 * @description commit阶段的入口
 * @param  root FiberRootNode
 */
function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}

	const lane = root.finishedLane;

	if (lane === NoLane && __DEV__) {
		console.error('commit阶段finishedLane不应该是NoLane');
	}

	// 重置
	root.finishedWork = null;
	root.finishedLane = NoLane;

	markRootFinished(root, lane);

	// 判断是否存在3个子阶段需要执行的操作
	// root flags root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation
		// mutation Placement
		commitMutationEffects(finishedWork);

		root.current = finishedWork;

		// layout
	} else {
		root.current = finishedWork;
	}
}

/**
 * @description reconciliation 阶段的核心循环
 *              它会持续处理 workInProgress 队列中的 Fiber 节点，
 *              直到整个 work-in-progress Fiber 树构建/更新完毕。
 */
function workLoop() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

/**
 * @description 处理单个 Fiber 节点的工作单元。
 *              它首先执行 "递" 阶段 (beginWork)，然后根据结果
 *              决定是继续向下处理子节点，还是执行 "归" 阶段 (completeUnitOfWork)。
 * @param fiber 当前要处理的 work-in-progress Fiber 节点。
 */
function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber, wipRootRenderLane);
	fiber.memoizedProps = fiber.pendingProps;

	if (next === null) {
		completeUnitOfWork(fiber);
	} else {
		workInProgress = next;
	}
}

/**
 * @description "归"阶段的入口。当一个 Fiber 节点的所有子节点都处理完毕后，
 *              会调用此函数来完成该节点自身的工作，并确定下一个要处理的节点
 *              (兄弟节点或父节点)。
 * @param fiber 当前完成了 "递" 阶段并且没有子节点需要立即处理的 Fiber 节点。
 */
function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;

		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
