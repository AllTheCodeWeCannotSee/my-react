let syncQueue: ((...args: any) => void)[] | null = null;
let isFlushingSyncQueue = false;

/**
 * @description 将一个回调函数添加到一个同步任务队列中
 */
export function scheduleSyncCallback(callback: (...args: any) => void) {
	if (syncQueue === null) {
		syncQueue = [callback];
	} else {
		syncQueue.push(callback);
	}
}

/**
 * @description 执行所有当前在同步任务队列 (syncQueue) 中等待执行的回调函数
 */
export function flushSyncCallbacks() {
	if (!isFlushingSyncQueue && syncQueue) {
		isFlushingSyncQueue = true;
		try {
			syncQueue.forEach((callback) => callback());
		} catch (e) {
			if (__DEV__) {
				console.error('flushSyncCallbacks报错', e);
			}
		} finally {
			isFlushingSyncQueue = false;
		}
	}
}
