import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { isSubsetOfLanes, Lane, mergeLanes, NoLane } from './fiberLanes';
import { FiberNode } from './fiber';

/**
 * @description 一个 Update 对象就代表了一次具体的“更新意图”，这个意图通过它的 action 属性来表达
 */
export interface Update<State> {
	action: Action<State>;
	lane: Lane;
	next: Update<any> | null;
	hasEagerState: boolean;
	eagerState: State | null;
}

/**
 * @description Hook.UpdateQueue
 */
export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	dispatch: Dispatch<State> | null;
}

/**
 * @description 一个创建 Update 对象的工厂函数
 */
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane,
	hasEagerState = false,
	eagerState = null
): Update<State> => {
	return {
		action,
		lane,
		next: null,
		hasEagerState,
		eagerState
	};
};

/**
 * @description 一个创建 UpdateQueue 对象的工厂函数
 */
export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		},
		// 这个 dispatch 属性稍后（比如在 useState Hook 初始化时）
		// 会被设置为与这个队列相关联的实际的派发函数（也就是我们常说的 setState 函数）
		dispatch: null
	} as UpdateQueue<State>;
};

/**
 * @function enqueueUpdate
 * @description 将一个 Update 对象添加到指定 FiberNode 的 UpdateQueue 中。
 *              这个函数负责维护 `updateQueue.shared.pending`，它是一个表示待处理更新的
 *              单向循环链表。新的 Update 对象会被添加到这个链表的末尾。
 *              同时，它还会将传入的 `lane` (更新的优先级) 合并到 FiberNode 及其 alternate
 *              的 `lanes` 属性中，以标记该 FiberNode 在此优先级上有待处理的工作。
 *
 * @template State - UpdateQueue 和 Update 对象所管理的状态类型。
 * @param {UpdateQueue<State>} updateQueue - 目标 FiberNode 的更新队列。
 * @param {Update<State>} update - 要入队的 Update 对象。
 * @param {FiberNode} fiber - 与此更新队列关联的 FiberNode。
 * @param {Lane} lane - 本次更新的优先级 Lane。
 *                      它将被合并到 `fiber.lanes` 和 `fiber.alternate.lanes` 中。
 */
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>,
	fiber: FiberNode,
	lane: Lane
) => {
	// `pending` 指向的是当前队列中最后一个更新。
	const pending = updateQueue.shared.pending;

	// 构建单向循环链表
	if (pending === null) {
		// pending = a -> a
		update.next = update;
	} else {
		// pending = b -> a -> b
		// pending = c -> a -> b -> c
		update.next = pending.next;
		pending.next = update;
	}

	updateQueue.shared.pending = update;
	fiber.lanes = mergeLanes(fiber.lanes, lane);
	const alternate = fiber.alternate;
	if (alternate !== null) {
		alternate.lanes = mergeLanes(alternate.lanes, lane);
	}
};

/**
 * @function basicStateReducer
 * @description 一个基础的状态 reducer 函数，用于 `useState` Hook。
 *              它根据传入的 `action` 来计算新的状态：
 *              - 如果 `action` 是一个函数，则将当前 `state` 作为参数调用该函数，
 *                并返回其结果作为新状态。
 *              - 如果 `action` 不是一个函数（即它是一个新的状态值），则直接返回 `action` 作为新状态。
 * @template State - 状态的类型。
 * @param {State} state - 当前状态。
 * @param {Action<State>} action - 更新操作，可以是一个新的状态值，也可以是一个接收前一个状态并返回新状态的函数。
 * @returns {State} 计算得到的新状态。
 */
export function basicStateReducer<State>(
	state: State,
	action: Action<State>
): State {
	if (action instanceof Function) {
		// baseState 1 update (x) => 4x -> memoizedState 4
		return action(state);
	} else {
		// baseState 1 update 2 -> memoizedState 2
		return action;
	}
}

/**
 * @function processUpdateQueue
 * @description 处理一个 Fiber 节点的更新队列，计算出新的状态。
 *              它会遍历待处理的更新链表 (`pendingUpdate`)，并根据当前渲染的优先级 (`renderLane`)
 *              来决定哪些更新应该被处理。
 *              - 优先级足够高的更新会被应用，计算出新的状态。
 *              - 优先级不够的更新会被跳过，并被收集到一个新的 `baseQueue` 中，以便在后续的渲染中处理。
 *              此函数还支持 "eager state" 优化，如果一个更新已经有了预计算的 `eagerState` 并且该状态与
 *              当前状态相同，则可以跳过实际的 `reducer` 调用。
 *
 * @template State - UpdateQueue 和 Update 对象所管理的状态类型。
 * @param {State} baseState - 开始处理更新前的基础状态。
 * @param {Update<State> | null} pendingUpdate - 指向待处理更新循环链表的最后一个更新对象。
 *                                               如果队列为空，则为 `null`。
 * @param {Lane} renderLane - 当前渲染工作的优先级 Lane。只有 lane 包含在 `renderLane` 中的更新才会被处理。
 * @param {(update: Update<State>) => void} [onSkipUpdate] - (可选) 当一个更新因为优先级不够而被跳过时调用的回调函数。
 *                                                          该回调接收被跳过的更新对象作为参数。
 * @returns {{
 *   memoizedState: State,  // 计算得出的最终状态，将存储在 Fiber 节点的 memoizedState 上。
 *   baseState: State,      // 如果有更新被跳过，这是第一个被跳过的更新之前计算出的状态；否则与 memoizedState 相同。
 *   baseQueue: Update<State> | null // 一个新的更新队列，包含所有被跳过的更新。如果所有更新都被处理了，则为 null。
 * }} 返回一个包含新状态和可能被跳过的更新队列的对象。
 */
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane,
	onSkipUpdate?: <State>(update: Update<State>) => void
): {
	memoizedState: State;
	baseState: State;
	baseQueue: Update<State> | null;
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState, // memoizedState: 上次更新计算的最终 state
		baseState,
		baseQueue: null
	};

	if (pendingUpdate !== null) {
		// 第一个update
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;

		let newBaseState = baseState;

		// 链表头
		let newBaseQueueFirst: Update<State> | null = null;
		// 链表尾
		let newBaseQueueLast: Update<State> | null = null;

		// newState 为本次更新参与计算的初始state
		let newState = baseState;

		do {
			// 传进来的 lane
			const updateLane = pending.lane;
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				// 优先级不够 被跳过
				const clone = createUpdate(pending.action, pending.lane);
				onSkipUpdate?.(clone);
				// 是不是第一个被跳过的
				if (newBaseQueueFirst === null) {
					// first u0 last = u0
					newBaseQueueFirst = clone;
					newBaseQueueLast = clone;
					newBaseState = newState;
				} else {
					// first u0 -> u1 -> u2
					// last u2
					(newBaseQueueLast as Update<State>).next = clone;
					newBaseQueueLast = clone;
				}
			} else {
				// 优先级足够
				if (newBaseQueueLast !== null) {
					// 有【被跳过的】，将其降为NoLane
					const clone = createUpdate(pending.action, NoLane);
					newBaseQueueLast.next = clone;
					newBaseQueueLast = clone;
				}
				const action = pending.action;
				if (pending.hasEagerState) {
					newState = pending.eagerState;
				} else {
					newState = basicStateReducer(baseState, action);
				}
			}
			pending = pending.next as Update<any>;
		} while (pending !== first);

		if (newBaseQueueLast === null) {
			// 本次计算没有update被跳过
			newBaseState = newState;
		} else {
			newBaseQueueLast.next = newBaseQueueFirst;
		}
		result.memoizedState = newState;
		result.baseState = newBaseState;
		result.baseQueue = newBaseQueueLast;
	}
	return result;
};
