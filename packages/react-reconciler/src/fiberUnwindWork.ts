import { FiberNode } from './fiber';
import { popProvider } from './fiberContext';
import { DidCapture, NoFlags, ShouldCapture } from './fiberFlags';
import { popSuspenseHandler } from './suspenseContext';
import { ContextProvider, HostRoot, SuspenseComponent } from './workTags';

/**
 * @function unwindWork
 * @description 在 "unwind" 阶段处理单个 Fiber 节点。当渲染过程中发生错误或 Suspense 挂起时，
 *              React 会从发生问题的 Fiber 节点开始向上遍历 Fiber 树，此函数会在遍历的每一步被调用。
 *              它的主要职责是：
 *              1. 对于特定类型的 Fiber 节点（如 `SuspenseComponent`, `ContextProvider`），
 *                 执行清理操作，例如从对应的栈中弹出处理器或上下文值。
 *              2. 识别并标记能够处理当前错误的边界组件（目前主要是 `SuspenseComponent`）。
 *                 如果当前 `wip` Fiber 是一个应该捕获错误的 `SuspenseComponent`，
 *                 它会被标记为 `DidCapture`，并作为结果返回，表示找到了处理边界。
 *              3. 如果当前 `wip` Fiber 不能处理错误或只是执行了清理操作（如 `ContextProvider`），
 *                 则返回 `null`，指示 unwind 过程应继续向上到父级 Fiber 节点。
 *
 * @param {FiberNode} wip - 当前正在进行 unwind 操作的 work-in-progress Fiber 节点。
 * @returns {FiberNode | null} 如果找到了一个可以处理错误的边界 Fiber (例如一个捕获了错误的 SuspenseComponent)，则返回该 FiberNode。否则返回 null，表示应继续向上 unwind。
 */
export function unwindWork(wip: FiberNode) {
	const flags = wip.flags;
	switch (wip.tag) {
		case SuspenseComponent:
			popSuspenseHandler();
			if (
				(flags & ShouldCapture) !== NoFlags &&
				(flags & DidCapture) === NoFlags
			) {
				wip.flags = (flags & ~ShouldCapture) | DidCapture;
				return wip;
			}
			return null;

		case ContextProvider:
			const context = wip.type._context;
			popProvider(context);
			return null;
		default:
			return null;
	}
}
