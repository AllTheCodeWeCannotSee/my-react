import ReactCurrentBatchConfig from 'react/src/currentBatchConfig';
import {
	unstable_getCurrentPriorityLevel,
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority
} from 'scheduler';
import { FiberRootNode } from './fiber';

export type Lane = number;
export type Lanes = number;

export const SyncLane = 0b00001;
export const NoLane = 0b00000;
export const NoLanes = 0b00000;
export const InputContinuousLane = 0b00010;
export const DefaultLane = 0b00100;
export const TransitionLane = 0b01000;
export const IdleLane = 0b10000;

/**
 * @description 将两个独立的优先级（Lane）合并成一个表示多个优先级的集合（Lanes）
 * @param laneA
 * @param laneB
 * @returns
 */
export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	return laneA | laneB;
}

/**
 * @description 请求一个用于更新的优先级 Lane。
 *              它首先检查当前是否处于一个 transition 过程中 (通过 `ReactCurrentBatchConfig.transition`)。
 *              如果是，则返回 `TransitionLane`。
 *              否则，它会从 Scheduler 包获取当前的调度优先级，
 *              然后将这个 Scheduler 优先级转换为 React 内部使用的 Lane。
 *              这个 Lane 代表了本次更新的紧急程度或类型。
 * @returns {Lane} 根据当前 Scheduler 的优先级转换得到的 Lane。
 *                 如果不在 transition 中，且 Scheduler 的优先级无法直接映射到一个已定义的 Lane
 *                 (例如 IdlePriority 或 LowPriority)，则可能返回 `NoLane` (取决于 `schedulerPriorityToLane` 的实现)。
 * @see {@link schedulerPriorityToLane} - 用于将 Scheduler 优先级转换为 Lane 的函数。
 * @see {@link unstable_getCurrentPriorityLevel} - Scheduler 包中用于获取当前调度优先级的函数。
 */
export function requestUpdateLane() {
	const isTransition = ReactCurrentBatchConfig.transition !== null;
	if (isTransition) {
		return TransitionLane;
	}
	// 从上下文环境中获取Scheduler优先级
	const currentSchedulerPriority = unstable_getCurrentPriorityLevel();
	const lane = schedulerPriorityToLane(currentSchedulerPriority);
	return lane;
}

/**
 * @description 获取优先级最高的lane（越小优先级越高）
 * @param lanes
 * @returns
 */
export function getHighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes;
}

/**
 * @description 判断优先级是否足够。
 * 				如果 subset 在 set 中，表示优先级足够；
 * 				否则，优先级不够
 * @param set
 * @param subset
 * @returns
 */
export function isSubsetOfLanes(set: Lanes, subset: Lane) {
	return (set & subset) === subset;
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
	root.suspendedLanes = NoLanes;
	root.pingedLanes = NoLanes;
}

/**
 * @function lanesToSchedulerPriority
 * @description 将 React 内部的 Lanes (表示多个优先级的集合) 转换为 Scheduler 包定义的单个优先级。
 *              它首先从 Lanes 中提取出最高优先级的 Lane，然后将这个 Lane 映射到对应的 Scheduler 优先级。
 *              这用于在调度 React 更新任务时，为 Scheduler 提供一个合适的优先级。
 *
 * @param {Lanes} lanes - 一个表示一个或多个 React 更新优先级的 Lanes 集合。
 * @returns {number} 转换后的 Scheduler 优先级常量。
 *                   - 如果 Lanes 中最高优先级的 Lane 是 `SyncLane`，返回 `unstable_ImmediatePriority`。
 *                   - 如果 Lanes 中最高优先级的 Lane 是 `InputContinuousLane`，返回 `unstable_UserBlockingPriority`。
 *                   - 如果 Lanes 中最高优先级的 Lane 是 `DefaultLane`，返回 `unstable_NormalPriority`。
 *                   - 对于其他情况（例如，如果最高优先级是 `IdleLane` 或 `NoLane`），默认返回 `unstable_IdlePriority`。
 * @see {@link getHighestPriorityLane} - 用于从 Lanes 集合中获取最高优先级 Lane 的函数。
 */
export function lanesToSchedulerPriority(lanes: Lanes) {
	const lane = getHighestPriorityLane(lanes);

	if (lane === SyncLane) {
		return unstable_ImmediatePriority;
	}
	if (lane === InputContinuousLane) {
		return unstable_UserBlockingPriority;
	}
	if (lane === DefaultLane) {
		return unstable_NormalPriority;
	}
	return unstable_IdlePriority;
}

/**
 * @function schedulerPriorityToLane
 * @description 将 Scheduler 包定义的优先级转换为 React 内部使用的 Lane。
 *
 * @param {number} schedulerPriority - 从 Scheduler 包获取的优先级常量，
 *                                     例如 `unstable_ImmediatePriority`, `unstable_UserBlockingPriority` 等。
 * @returns {Lane} 转换后的 React Lane。
 *                 - `unstable_ImmediatePriority` 映射到 `SyncLane`。
 *                 - `unstable_UserBlockingPriority` 映射到 `InputContinuousLane`。
 *                 - `unstable_NormalPriority` 映射到 `DefaultLane`。
 *                 - 其他未明确映射的 Scheduler 优先级（例如 `unstable_IdlePriority` 或 `unstable_LowPriority`）
 *                   将返回 `NoLane`，表示没有对应的特定 React Lane 或这是一个非常低的优先级。
 */
export function schedulerPriorityToLane(schedulerPriority: number): Lane {
	if (schedulerPriority === unstable_ImmediatePriority) {
		return SyncLane;
	}
	if (schedulerPriority === unstable_UserBlockingPriority) {
		return InputContinuousLane;
	}
	if (schedulerPriority === unstable_NormalPriority) {
		return DefaultLane;
	}
	return NoLane;
}

export function markRootPinged(root: FiberRootNode, pingedLane: Lane) {
	root.pingedLanes |= root.suspendedLanes & pingedLane;
}

export function markRootSuspended(root: FiberRootNode, suspendedLane: Lane) {
	root.suspendedLanes |= suspendedLane;
	root.pingedLanes &= ~suspendedLane;
}

/**
 * @function getNextLane
 * @description 从 FiberRootNode 中获取下一个要处理的最高优先级 Lane。
 *              它会考虑待处理的 lanes (`pendingLanes`)，并排除掉当前被挂起的 lanes (`suspendedLanes`)。
 *              如果所有待处理的 lanes 都被挂起了，它会检查是否有被 ping 过的 lanes (`pingedLanes`) 可以处理。
 *
 * @param {FiberRootNode} root - 当前应用的 FiberRootNode 实例。
 * @returns {Lane} 返回下一个要处理的最高优先级 Lane。
 *                 如果没有任何可处理的 Lane (所有 pendingLanes 都被 suspended 且没有 pingedLanes)，
 *                 或者根本没有 pendingLanes，则返回 `NoLane`。
 *
 * @example
 * // root.pendingLanes = 0b00110 (DefaultLane | InputContinuousLane)
 * // root.suspendedLanes = 0b00010 (InputContinuousLane is suspended)
 * // getNextLane(root) will return 0b00100 (DefaultLane)
 */
export function getNextLane(root: FiberRootNode): Lane {
	const pendingLanes = root.pendingLanes;

	if (pendingLanes === NoLanes) {
		return NoLane;
	}
	let nextLane = NoLane;

	// 排除掉挂起的lane
	const suspendedLanes = pendingLanes & ~root.suspendedLanes;
	if (suspendedLanes !== NoLanes) {
		nextLane = getHighestPriorityLane(suspendedLanes);
	} else {
		const pingedLanes = pendingLanes & root.pingedLanes;
		if (pingedLanes !== NoLanes) {
			nextLane = getHighestPriorityLane(pingedLanes);
		}
	}
	return nextLane;
}

/**
 * @function includeSomeLanes
 * @description 检查一个 Lanes 集合 (`set`) 是否包含另一个 Lanes 集合或单个 Lane (`subset`) 中的任何一个 Lane。
 *              换句话说，它判断两个 Lanes 集合之间是否存在交集。
 *
 * @param {Lanes} set - 第一个 Lanes 集合。
 * @param {Lane | Lanes} subset - 第二个 Lanes 集合或单个 Lane，用于检查是否与 `set` 有交集。
 * @returns {boolean} 如果 `set` 和 `subset` 之间至少有一个共同的 Lane (即它们的按位与结果不为 `NoLanes`)，则返回 `true`；否则返回 `false`。
 *
 * @example
 * // includeSomeLanes(0b0110, 0b0010) === true (both include InputContinuousLane)
 * // includeSomeLanes(0b0100, 0b0010) === false (no common lanes)
 */
export function includeSomeLanes(set: Lanes, subset: Lane | Lanes): boolean {
	return (set & subset) !== NoLanes;
}

/**
 * @function removeLanes
 * @description 从一个 Lanes 集合 (`set`) 中移除另一个 Lanes 集合或单个 Lane (`subset`) 中包含的所有 Lanes。
 * @param {Lanes} set - 原始的 Lanes 集合。
 * @param {Lanes | Lane} subset - 要从 `set` 中移除的 Lanes 集合或单个 Lane。
 * @returns {Lanes} 返回一个新的 Lanes 集合，它是 `set` 中移除了 `subset` 中所有 Lanes 之后的结果。
 */
export function removeLanes(set: Lanes, subet: Lanes | Lane): Lanes {
	return set & ~subet;
}
