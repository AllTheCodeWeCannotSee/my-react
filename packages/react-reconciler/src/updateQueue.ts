import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { Lane } from './fiberLanes';

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
 * @param renderLane
 * @returns 函数返回一个对象，这个对象有一个 memoizedState 属性，代表应用更新后得到的新状态
 */
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane
): { memoizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};

	if (pendingUpdate !== null) {
		// 第一个update
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;
		do {
			const updateLane = pending.lane;
			if (updateLane === renderLane) {
				const action = pending.action;
				if (action instanceof Function) {
					// baseState 1 update (x) => 4x -> memoizedState 4
					baseState = action(baseState);
				} else {
					// baseState 1 update 2 -> memoizedState 2
					baseState = action;
				}
			} else {
				if (__DEV__) {
					console.error('不应该进入updateLane !== renderLane逻辑');
				}
			}
			pending = pending.next as Update<any>;
		} while (pending !== first);
	}
	result.memoizedState = baseState;
	return result;
};
