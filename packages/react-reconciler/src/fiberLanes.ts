import { FiberRootNode } from './fiber';

export type Lane = number;
export type Lanes = number;

export const SyncLane = 0b0001;
export const NoLane = 0b0000;
export const NoLanes = 0b0000;

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
 * @description 根据上下文返回优先级
 * @returns
 */
export function requestUpdateLane() {
	return SyncLane;
}

/**
 * @description 获取优先级最高的lane（越小优先级越高）
 * @param lanes
 * @returns
 */
export function getHighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes;
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
}
