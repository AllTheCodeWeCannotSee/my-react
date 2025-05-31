import {
	FulfilledThenable,
	PendingThenable,
	RejectedThenable,
	Thenable
} from 'shared/ReactTypes';

export const SuspenseException = new Error(
	'这不是个真实的错误，而是Suspense工作的一部分。如果你捕获到这个错误，请将它继续抛出去'
);

let suspendedThenable: Thenable<any> | null = null;

/**
 * @description 获取最近一次因 Suspense 而挂起的 Thenable 对象。
 * @returns {Thenable<any>} 返回导致挂起的 Thenable 对象。
 * @throws {Error} 如果在调用此函数时 `suspendedThenable` 为 `null`，则抛出错误，表明状态异常。
 */
export function getSuspenseThenable(): Thenable<any> {
	if (suspendedThenable === null) {
		throw new Error('应该存在suspendedThenable，这是个bug');
	}
	const thenable = suspendedThenable;
	suspendedThenable = null;
	return thenable;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
/**
 * @description 一个空操作函数，不执行任何逻辑。
 */
function noop() {}

/**
 * @description 追踪并处理一个 `Thenable` 对象（通常是 Promise）的状态，用于实现 React Suspense。
 *              - 如果 `Thenable` 已完成 (fulfilled)，则返回其结果值。
 *              - 如果 `Thenable` 已拒绝 (rejected)，则抛出其拒绝原因。
 *              - 如果 `Thenable` 处于 pending 状态或未被追踪过 (untracked)，
 *                则会为其附加 `then` 回调来更新其内部状态 (`status`, `value`/`reason`)，
 *                然后将此 `Thenable` 存储到模块级的 `suspendedThenable` 变量中，
 *                并抛出 `SuspenseException`。这个异常会被最近的 Suspense 边界捕获，
 *                从而触发 Suspense 的挂起逻辑。
 *
 * @template T - `Thenable` 对象成功解析时返回的值的类型。
 * @param {Thenable<T>} thenable - 需要被追踪和处理的 `Thenable` 对象。
 * @returns {T} 如果 `Thenable` 已成功解析，则返回其解析值。
 * @throws {any} 如果 `Thenable` 已被拒绝，则抛出其拒绝原因。
 * @throws {Error} 如果 `Thenable` 处于 pending 状态或未被追踪，则抛出 `SuspenseException`。
 */
export function trackUsedThenable<T>(thenable: Thenable<T>) {
	switch (thenable.status) {
		// 需要自己定义
		case 'fulfilled':
			return thenable.value;
		// 需要自己定义
		case 'rejected':
			throw thenable.reason;
		default:
			if (typeof thenable.status === 'string') {
				// 已经包装过
				thenable.then(noop, noop);
			} else {
				// untracked
				const pending = thenable as unknown as PendingThenable<T, void, any>;
				pending.status = 'pending';
				pending.then(
					// resolved
					(val) => {
						if (pending.status === 'pending') {
							// @ts-ignore
							const fulfilled: FulfilledThenable<T, void, any> = pending;
							fulfilled.status = 'fulfilled';
							fulfilled.value = val;
						}
					},
					// rejected
					(err) => {
						if (pending.status === 'pending') {
							// @ts-ignore
							const rejected: RejectedThenable<T, void, any> = pending;
							rejected.reason = err;
							rejected.status = 'rejected';
						}
					}
				);
			}
	}
	suspendedThenable = thenable;
	throw SuspenseException;
}
