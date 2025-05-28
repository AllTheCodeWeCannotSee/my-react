import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { isSubsetOfLanes, Lane, NoLane } from './fiberLanes';

/**
 * @description 一个 Update 对象就代表了一次具体的“更新意图”，这个意图通过它的 action 属性来表达
 */
export interface Update<State> {
	action: Action<State>;
	lane: Lane;
	next: Update<any> | null;
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
	lane: Lane
): Update<State> => {
	return {
		action,
		lane,
		next: null
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
 * @description 这个函数用于将一个 Update 对象“入队”到一个 UpdateQueue 中
 */
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
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
};

/**
 * @description 计算并返回新的状态
 * @param baseState 进行更新计算前的基础状态（当前状态）
 * @param pendingUpdate 等待处理的更新对象，如果队列为空，则为 null
 * @param renderLane 本次更新的 lane
 * @returns 函数返回一个对象，这个对象有一个 memoizedState 属性，代表应用更新后得到的新状态
 */
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane
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
				if (action instanceof Function) {
					// baseState 1 update (x) => 4x -> memoizedState 4
					newState = action(baseState);
				} else {
					// baseState 1 update 2 -> memoizedState 2
					newState = action;
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
