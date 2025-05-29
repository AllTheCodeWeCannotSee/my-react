import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitMutationEffects,
	commitLayoutEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	createWorkInProgress,
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import { HostRoot } from './workTags';
import {
	getHighestPriorityLane,
	Lane,
	lanesToSchedulerPriority,
	markRootFinished,
	mergeLanes,
	NoLane,
	SyncLane
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { scheduleMicroTask } from 'hostConfig';
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';
import { useEffect } from 'react';

let workInProgress: FiberNode | null = null;

// 用于存储当前正在进行的渲染工作（针对整个 work-in-progress Fiber 树）的优先级（Lane）
let wipRootRenderLane: Lane = NoLane;
let rootDoesHasPassiveEffects = false;

type RootExitStatus = number;
const RootInComplete = 1;
const RootCompleted = 2;
// TODO 执行过程中报错了

/**
 * @description 为新的渲染或更新周期准备初始环境。
 *              它会创建一个新的 WIP Fiber 树的根，
 *              并记录当前更新的优先级。
 * @param root FiberRootNode，代表整个应用的根。
 * @param lane 本次更新的优先级。
 */
function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
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
 * @function ensureRootIsScheduled
 * @description 确保 FiberRootNode 的更新任务被正确调度。
 *              此函数会检查根节点上待处理的更新（`pendingLanes`），
 *              并根据最高优先级的 Lane 来决定如何以及是否需要调度或重新调度一个回调任务。
 *
 *              主要逻辑步骤：
 *              1. 获取 `root.pendingLanes` 中最高优先级的 `updateLane`。
 *              2. 如果 `updateLane` 为 `NoLane` (没有待处理的更新)：
 *                 - 如果存在已调度的回调 (`existingCallback`)，则调用 `unstable_cancelCallback` 取消它。
 *                 - 清空 `root.callbackNode` 和 `root.callbackPriority`。
 *                 - 函数返回。
 *              3. 如果 `updateLane` 的优先级 (`curPriority`) 与 `root.callbackPriority` (上一个已调度回调的优先级 `prevPriority`) 相同：
 *                 - 函数直接返回，避免重复调度。
 *              4. 如果优先级不同（或之前没有回调）：
 *                 - 如果存在 `existingCallback`，则调用 `unstable_cancelCallback` 取消它。
 *                 - 根据 `updateLane` 的类型调度新的回调：
 *                   - 如果 `updateLane` 是 `SyncLane` (同步优先级)：
 *                     - 调用 `scheduleSyncCallback` 将 `performSyncWorkOnRoot` 注册为一个同步回调。
 *                     - 调用 `scheduleMicroTask(flushSyncCallbacks)` 安排在下一个微任务中执行所有同步回调。
 *                   - 如果 `updateLane` 是其他异步优先级：
 *                     - 调用 `lanesToSchedulerPriority` 将 React Lane 转换为 Scheduler 优先级。
 *                     - 调用 `scheduleCallback` (来自 `scheduler` 包) 来安排 `performConcurrentWorkOnRoot` 作为宏任务执行。
 *                     - 将返回的 `newCallbackNode` 存储在 `root.callbackNode`。
 *                 - 更新 `root.callbackNode` (对于异步任务) 和 `root.callbackPriority`。
 *
 * @param {FiberRootNode} root - 需要检查和调度其更新的 FiberRootNode 实例。
 */
function ensureRootIsScheduled(root: FiberRootNode) {
	const updateLane = getHighestPriorityLane(root.pendingLanes);
	const existingCallback = root.callbackNode;
	if (updateLane === NoLane) {
		if (existingCallback !== null) {
			unstable_cancelCallback(existingCallback);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;

	if (curPriority === prevPriority) {
		return;
	}

	if (existingCallback !== null) {
		unstable_cancelCallback(existingCallback);
	}
	let newCallbackNode = null;

	if (__DEV__) {
		console.log(
			`在${updateLane === SyncLane ? '微' : '宏'}任务中调度，优先级：`,
			updateLane
		);
	}

	if (updateLane === SyncLane) {
		// 同步优先级 用微任务调度
		// [performSyncWorkOnRoot, performSyncWorkOnRoot, performSyncWorkOnRoot]
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其他优先级 用宏任务调度
		const schedulerPriority = lanesToSchedulerPriority(updateLane);

		// scheduleCallback: 将宏任务放进队列
		newCallbackNode = scheduleCallback(
			schedulerPriority,
			// @ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}
	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
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
 * @function performConcurrentWorkOnRoot
 * @description 执行并发模式下的渲染工作。
 *              它会处理被动副作用（useEffect），然后根据待处理的最高优先级 Lane
 *              来执行渲染（renderRoot）。如果渲染工作因为时间分片而被中断，
 *              它会返回一个新的函数，以便 Scheduler 稍后可以继续执行。
 *              如果渲染完成，它会提交工作（commitRoot）。
 *              此函数还负责在适当的时候重新调度根节点的更新。
 *
 * @param {FiberRootNode} root - 需要执行并发工作的 FiberRootNode 实例。
 * @param {boolean} didTimeout - 一个布尔值，由 Scheduler 传入，指示当前任务是否已超时。
 *                               如果为 true，即使是并发更新，也可能需要同步完成以避免饥饿。
 * @returns {Function | null} 如果工作被中断，返回一个绑定了当前 root 的
 *                            `performConcurrentWorkOnRoot` 函数，以便后续继续执行。
 *                            如果工作完成或没有工作可做，则返回 `null`。
 */
function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	// 保证useEffect回调执行
	const curCallback = root.callbackNode;
	const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects);
	if (didFlushPassiveEffect) {
		if (root.callbackNode !== curCallback) {
			return null;
		}
	}

	const lane = getHighestPriorityLane(root.pendingLanes);
	const curCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	const needSync = lane === SyncLane || didTimeout;
	// render阶段
	const exitStatus = renderRoot(root, lane, !needSync);

	ensureRootIsScheduled(root);

	if (exitStatus === RootInComplete) {
		// 中断
		if (root.callbackNode !== curCallbackNode) {
			return null;
		}
		return performConcurrentWorkOnRoot.bind(null, root);
	}
	if (exitStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = lane;
		wipRootRenderLane = NoLane;
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现的并发更新结束状态');
	}
}

/**
 * @function performSyncWorkOnRoot
 * @description 同步更新流程的入口函数。
 *              它负责处理具有同步优先级的更新。首先，它会检查根节点上待处理的最高优先级是否确实是同步的。
 *              如果是，则调用 `renderRoot` 来同步构建 work-in-progress (WIP) Fiber 树。
 *              如果 `renderRoot` 成功完成，它会将构建好的 WIP 树（`finishedWork`）和完成的优先级（`finishedLane`）
 *              设置到 FiberRootNode 上，然后调用 `commitRoot` 将变更提交到实际的 DOM。
 *              如果待处理的最高优先级不是同步的，它会调用 `ensureRootIsScheduled` 来确保以正确的（可能是异步的）方式重新调度。
 *
 * @param {FiberRootNode} root - 需要执行同步工作的 FiberRootNode 实例。
 *                               此 FiberRootNode 持有整个应用的状态和待处理的更新。
 */
function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	// 如果当前 root 上挂起的最高优先级不是 SyncLane，则重新调用 ensureRootIsScheduled 来确保正确的调度
	if (nextLane !== SyncLane) {
		// 其他比SyncLane低的优先级
		// NoLane
		ensureRootIsScheduled(root);
		return;
	}
	const exitStatus = renderRoot(root, nextLane, false);

	if (exitStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = nextLane;
		wipRootRenderLane = NoLane;

		// wip fiberNode树 树中的flags
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现的同步更新结束状态');
	}
}

/**
 * @function renderRoot
 * @description Render 阶段的核心函数。它负责根据给定的优先级（lane）
 *              来构建或更新 work-in-progress (WIP) Fiber 树。
 *              此函数可以同步执行，也可以在并发模式下支持时间分片。
 *
 *              主要流程：
 *              1. 检查当前渲染的 lane 是否与全局的 `wipRootRenderLane` 匹配。
 *                 如果不匹配，说明这是一个新的渲染任务（或者优先级发生了变化），
 *                 需要调用 `prepareFreshStack` 来初始化一个新的 WIP 树。
 *              2. 进入一个 `do...while` 循环，该循环会持续执行工作单元，直到整个 WIP 树构建完成或被中断。
 *                 - 在循环内部，根据 `shouldTimeSlice` 参数决定是调用 `workLoopConcurrent` (并发模式)
 *                   还是 `workLoopSync` (同步模式)。
 *                 - 如果在执行工作单元时发生错误，会捕获错误，并将 `workInProgress` 重置为 `null`，
 *                   然后继续 `do...while` 循环（通常意味着会重新尝试或放弃）。
 *              3. 循环结束后，根据 `workInProgress` 的状态判断渲染结果：
 *                 - 如果 `shouldTimeSlice` 为 `true` 且 `workInProgress` 不为 `null`，
 *                   说明并发渲染因为时间分片而被中断，返回 `RootInComplete`。
 *                 - 如果 `shouldTimeSlice` 为 `false` 且 `workInProgress` 不为 `null`（在开发模式下会报错），
 *                   或者 `workInProgress` 为 `null`（表示渲染完成），则返回 `RootCompleted`。
 *                 - 其他情况（如发生未捕获的错误导致 `workInProgress` 状态异常）可能会有其他退出状态（TODO）。
 *
 * @param {FiberRootNode} root - 需要进行渲染的 FiberRootNode 实例。
 * @param {Lane} lane - 本次渲染工作的优先级 Lane。
 * @param {boolean} shouldTimeSlice - 指示是否应该启用时间分片。
 *                                    如果为 `true`，则使用并发工作循环 (`workLoopConcurrent`)，
 *                                    允许渲染工作在 `unstable_shouldYield()` 返回 `true` 时被中断。
 *                                    如果为 `false`，则使用同步工作循环 (`workLoopSync`)，
 *                                    渲染工作会一次性完成，不会被中断。
 * @returns {RootExitStatus} 一个表示渲染结果的状态码：
 *                           - `RootInComplete` (1): 渲染工作被中断（通常在并发模式下由于时间分片）。
 *                           - `RootCompleted` (2): 渲染工作成功完成。
 */
function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	}

	if (wipRootRenderLane !== lane) {
		// 初始化
		prepareFreshStack(root, lane);
	}

	do {
		try {
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop发生错误', e);
			}
			workInProgress = null;
		}
	} while (true);
	// 中断执行
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}
	// render阶段执行完
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error(`render阶段结束时wip不应该不是null`);
	}
	// TODO 报错
	return RootCompleted;
}

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

	// 需要执行 useEffect 的回调
	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		// 防止多次执行 commitRoot 时，执行多次调度
		if (!rootDoesHasPassiveEffects) {
			rootDoesHasPassiveEffects = true;
			// 调度副作用
			scheduleCallback(NormalPriority, () => {
				// 执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	// 判断是否存在3个子阶段需要执行的操作
	// root flags root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags;
	const rootHasEffect =
		(finishedWork.flags & (MutationMask | PassiveMask)) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// 阶段1/3: beforeMutation
		// 阶段2/3: mutation Placement
		commitMutationEffects(finishedWork, root);

		// fiber 树的切换
		root.current = finishedWork;

		// 阶段3/3: layout
		commitLayoutEffects(finishedWork, root);
	} else {
		root.current = finishedWork;
	}
	rootDoesHasPassiveEffects = false;
	ensureRootIsScheduled(root);
}

/**
 * @function flushPassiveEffects
 * @description 执行所有待处理的被动副作用 (useEffect 的创建和销毁回调)。
 *              这个函数通常由 Scheduler 在浏览器完成绘制后异步调用。
 *
 *              主要流程：
 *              1. 遍历 `pendingPassiveEffects.unmount` 数组，对每个 Effect 对象调用
 *                 `commitHookEffectListUnmount` 来执行其销毁函数。
 *                 执行后清空 `unmount` 数组。
 *              2. 遍历 `pendingPassiveEffects.update` 数组，对每个 Effect 对象调用
 *                 `commitHookEffectListDestroy` 来执行其上一次的销毁函数（如果存在）。
 *              3. 再次遍历 `pendingPassiveEffects.update` 数组，对每个 Effect 对象调用
 *                 `commitHookEffectListCreate` 来执行其创建函数。
 *                 执行后清空 `update` 数组。
 *              4. 调用 `flushSyncCallbacks` 来处理在 `useEffect` 回调中可能同步触发的任何状态更新。
 *              5. 返回一个布尔值，指示是否实际执行了任何被动副作用。
 *
 * @param {PendingPassiveEffects} pendingPassiveEffects - 一个包含 'unmount' 和 'update' 两个 Effect 数组的对象，
 *                                                      这些 Effect 是在 commit 阶段收集的。
 * @returns {boolean} 如果至少执行了一个被动副作用的销毁或创建回调，则返回 `true`；否则返回 `false`。
 */
function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false;
	// 首先触发所有unmount effect
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	// 触发所有上次更新的destroy
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	// 触发所有这次更新的create
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});

	// 回调过程中，触发的更新
	pendingPassiveEffects.update = [];
	flushSyncCallbacks();
	return didFlushPassiveEffect;
}

/**
 * @function workLoopSync
 * @description 同步模式下的核心渲染循环。
 *              它会持续处理 `workInProgress` 队列中的 Fiber 节点，
 *              直到整个 work-in-progress Fiber 树构建/更新完毕。
 *              与 `workLoopConcurrent` 不同，此循环不会被 `unstable_shouldYield()` 中断，
 *              它会一次性完成所有工作。
 *
 *              在循环的每次迭代中，它都会调用 `performUnitOfWork` 来处理当前的 `workInProgress` Fiber 节点。
 *              `performUnitOfWork` 会执行 "递" 阶段（`beginWork`）和可能的 "归" 阶段（`completeUnitOfWork`），
 *              并更新 `workInProgress` 指向下一个要处理的节点。
 *
 * @see {@link performUnitOfWork} - 处理单个 Fiber 节点的工作单元。
 */
function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

/**
 * @function workLoopConcurrent
 * @description 并发模式下的核心渲染循环。
 *              它会持续处理 `workInProgress` 队列中的 Fiber 节点，
 *              直到整个 work-in-progress Fiber 树构建/更新完毕，
 *              或者 `unstable_shouldYield()` 返回 `true`，指示应该暂停工作以允许浏览器处理其他任务（如用户输入或绘制）。
 *              这是实现时间分片（time slicing）的关键。
 *
 *              在循环的每次迭代中，它都会调用 `performUnitOfWork` 来处理当前的 `workInProgress` Fiber 节点。
 *              `performUnitOfWork` 会执行 "递" 阶段（`beginWork`）和可能的 "归" 阶段（`completeUnitOfWork`），
 *              并更新 `workInProgress` 指向下一个要处理的节点。
 *
 * @see {@link performUnitOfWork} - 处理单个 Fiber 节点的工作单元。
 * @see {@link unstable_shouldYield} - Scheduler 提供的函数，用于判断是否应该暂停当前工作。
 */
function workLoopConcurrent() {
	while (workInProgress !== null && !unstable_shouldYield()) {
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
