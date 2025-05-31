import { Wakeable } from 'shared/ReactTypes';
import { FiberNode, FiberRootNode } from './fiber';
import { ShouldCapture } from './fiberFlags';
import { Lane, Lanes, SyncLane, markRootPinged } from './fiberLanes';
import { ensureRootIsScheduled, markRootUpdated } from './workLoop';
import { getSuspenseHandler } from './suspenseContext';

/**
 * @function attachPingListener
 * @description 当一个 "thenable" (例如 Promise) 导致 Suspense 挂起时，
 *              此函数为其附加一个 "ping" 监听器。当 thenable 完成 (resolve 或 reject) 时，
 *              会调用 ping 函数，该函数会标记 FiberRootNode 已更新，并使用原始的 lane
 *              重新调度工作，以尝试恢复渲染。
 *              它使用 `root.pingCache` (一个 WeakMap) 来存储 wakeable 与一组 lanes 之间的映射，
 *              以避免为同一个 wakeable 和 lane 重复附加监听器。
 *
 * @param {FiberRootNode} root - 当前应用的 FiberRootNode 实例。
 *                               用于存储 ping 缓存和调度后续的更新。
 * @param {Wakeable<any>} wakeable - 导致 Suspense 挂起的 "thenable" 对象 (例如 Promise)。
 *                                   当此对象 resolve 或 reject 时，会触发 ping 函数。
 * @param {Lane} lane - 触发此次 Suspense 挂起的更新所属的优先级 (Lane)。
 *                      当 wakeable 完成后，会使用此 lane 来重新调度更新。
 */
function attachPingListener(
	root: FiberRootNode,
	wakeable: Wakeable<any>,
	lane: Lane
) {
	let pingCache = root.pingCache;
	let threadIDs: Set<Lane> | undefined;

	// WeakMap{ wakeable: Set[lane1, lane2, ...]}
	if (pingCache === null) {
		threadIDs = new Set<Lane>();
		pingCache = root.pingCache = new WeakMap<Wakeable<any>, Set<Lane>>();
		pingCache.set(wakeable, threadIDs);
	} else {
		threadIDs = pingCache.get(wakeable);
		if (threadIDs === undefined) {
			threadIDs = new Set<Lane>();
			pingCache.set(wakeable, threadIDs);
		}
	}
	if (!threadIDs.has(lane)) {
		// 第一次进入
		threadIDs.add(lane);

		function ping() {
			if (pingCache !== null) {
				pingCache.delete(wakeable);
			}
			markRootUpdated(root, lane);
			markRootPinged(root, lane);
			ensureRootIsScheduled(root);
		}
		wakeable.then(ping, ping);
	}
}

/**
 * @function throwException
 * @description 处理在渲染过程中抛出的值，特别是用于实现 Suspense 机制。
 *              如果抛出的值是一个 "thenable" (例如 Promise)，此函数会：
 *              1. 寻找最近的 Suspense 边界 (通过 `getSuspenseHandler`)。
 *              2. 如果找到 Suspense 边界，则在该边界 Fiber 节点上标记 `ShouldCapture` flag，
 *                 指示它应该捕获这个挂起状态。
 *              3. 调用 `attachPingListener` 为该 thenable 和当前的渲染优先级 (`lane`)
 *                 在 `root.pingCache` 中注册一个监听器。当 thenable 解析或拒绝时，
 *                 会触发 `ping` 函数，该函数会标记 root 已更新并重新调度渲染。
 *              如果抛出的值不是 thenable，则目前不执行特定操作（未来可能用于错误边界处理）。
 *
 * @param {FiberRootNode} root - 当前的 FiberRootNode 实例。
 * @param {any} value - 在渲染过程中被抛出的值。
 * @param {Lane} lane - 抛出异常时，当前渲染工作的优先级 Lane。
 */
export function throwException(root: FiberRootNode, value: any, lane: Lane) {
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof value.then === 'function'
	) {
		const weakable: Wakeable<any> = value;

		const suspenseBoundary = getSuspenseHandler();
		if (suspenseBoundary) {
			suspenseBoundary.flags |= ShouldCapture;
		}
		attachPingListener(root, weakable, lane);
	}
}
