import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';

/**
 * @description 一个 Update 对象就代表了一次具体的“更新意图”，这个意图通过它的 action 属性来表达
 */
export interface Update<State> {
	action: Action<State>;
}

export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	dispatch: Dispatch<State> | null;
}

/**
 * @description 一个创建 Update 对象的工厂函数
 */
export const createUpdate = <State>(action: Action<State>): Update<State> => {
	return {
		action
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
	updateQueue.shared.pending = update;
};

/**
 * @description 这是处理更新队列中更新的核心函数，它计算并返回新的状态
 * @param baseState 进行更新计算前的基础状态（当前状态）
 * @param pendingUpdate 等待处理的更新对象，如果队列为空，则为 null
 * @returns 函数返回一个对象，这个对象有一个 memoizedState 属性，代表应用更新后得到的新状态
 */
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null
): { memoizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};

	if (pendingUpdate !== null) {
		const action = pendingUpdate.action;
		// 如果 action 是一个函数
		if (action instanceof Function) {
			// 例如：基础状态是 1，action 是 (x) => 4*x，那么新状态就是 4
			result.memoizedState = action(baseState);
			// 如果 action 是一个直接的值
		} else {
			// 例如：基础状态是 1，action 是 2，那么新状态就是 2
			result.memoizedState = action;
		}
	}

	return result;
};
