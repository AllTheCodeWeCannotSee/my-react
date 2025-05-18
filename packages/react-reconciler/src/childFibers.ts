import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { Props, ReactElementType } from 'shared/ReactTypes';
import {
	createFiberFromElement,
	createWorkInProgress,
	FiberNode
} from './fiber';
import { ChildDeletion, Placement } from './fiberFlags';
import { HostText } from './workTags';

/**
 * @description 这是一个工厂函数。它本身不直接进行协调工作，而是返回一个执行协调工作的函数。
 * @param {boolean} shouldTrackEffects
 * * 如果为 true，协调器会追踪“副作用”，比如需要在 DOM 中放置一个新元素（Placement）或删除一个旧元素（ChildDeletion）。这通常在更新一个已存在的组件树时使用。
 * * 如果为 false，它不会以同样的方式追踪这些副作用。这通常在组件树首次挂载时使用，因为所有东西都是新的，都需要被放置。
 */
function ChildReconciler(shouldTrackEffects: boolean) {
	/**
	 * @description 当一个子 Fiber 节点需要被标记为删除时，会调用这个函数。
	 * @param returnFiber - 使用 reconcileChildFibers 作用域的 returnFiber， wip的父节点
	 * @param childToDelete  - 使用 reconcileChildFibers 作用域的 currentFiber， current tree对应的的子节点
	 * @see {@link reconcileChildFibers}
	 * @returns
	 */
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
		// 如果 shouldTrackEffects 为 false
		// 它什么也不做（如果不在追踪副作用，就没必要追踪删除，例如在初始挂载时，没有旧东西可删）。
		if (!shouldTrackEffects) {
			return;
		}

		// 否则，它会将 childToDelete 添加到 returnFiber.deletions 数组中。returnFiber 是父 Fiber。
		const deletions = returnFiber.deletions;
		if (deletions === null) {
			returnFiber.deletions = [childToDelete];

			// 在 returnFiber.flags 上设置一个 ChildDeletion 标记。
			// 这告诉 React，这个父节点有一些子节点需要在稍后的“提交阶段”（commit phase）从实际 DOM 中移除。
			returnFiber.flags |= ChildDeletion;
		} else {
			deletions.push(childToDelete);
		}
	}

	/**
	 * @description 这个函数处理 newChild 是单个 React 元素（例如 <div></div> 或 <MyComponent />）的情况。
	 * @param returnFiber 使用 reconcileChildFibers 作用域的 returnFiber， wip的父节点
	 * @param currentFiber 使用 reconcileChildFibers 作用域的 currentFiber， current tree对应的的子节点
	 * @param element 使用 reconcileChildFibers 作用域的 newChild，子节点 的 ReactElement
	 * @returns
	 */
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;
		work: if (currentFiber !== null) {
			// update
			if (currentFiber.key === key) {
				// key相同
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						// type相同
						const existing = useFiber(currentFiber, element.props);
						existing.return = returnFiber;
						return existing;
					}

					// 删掉旧的
					deleteChild(returnFiber, currentFiber);
					break work;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型', element);
						break work;
					}
				}
			} else {
				// 删掉旧的
				deleteChild(returnFiber, currentFiber);
			}
		}
		// 根据element创建fiber
		const fiber = createFiberFromElement(element);
		fiber.return = returnFiber;
		return fiber;
	}

	/**
	 * @description 专门用于处理文本内容（例如 <div>你好</div> 中的 "你好"）。
	 * @param returnFiber 使用 reconcileChildFibers 作用域的 returnFiber， wip的父节点
	 * @param currentFiber 使用 reconcileChildFibers 作用域的 currentFiber， current tree对应的的子节点
	 * @param content 文本内容
	 * @returns
	 */
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		// 1. 检查是否存在上一次渲染的 Fiber 节点 (currentFiber)
		if (currentFiber !== null) {
			// 如果存在，说明是更新操作

			// 2. 检查上一次的 Fiber 节点是否也是一个文本节点
			if (currentFiber.tag === HostText) {
				// 类型没变，可以复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				return existing;
			}
			// 如果 currentFiber 存在，但它的类型不是 HostText (例如，它之前是一个元素节点)，
			// 那么节点类型发生了变化，我们不能复用它来表示文本。
			// 调用 deleteChild 将 currentFiber 标记为删除 (从 DOM 中移除)
			deleteChild(returnFiber, currentFiber);
		}

		// 3. 创建新的文本 Fiber 节点
		// 如果之前没有对应的 Fiber 节点 (currentFiber === null)，
		// 或者之前的节点类型不同且已被删除，则执行此部分。
		// 创建一个新的 FiberNode 来代表这个文本。
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}

	/**
	 * @description 如果首屏渲染 & 应该追踪副作用的情况下，进行标记
	 * @param fiber wip-fiber-node
	 */
	function placeSingleChild(fiber: FiberNode) {
		if (shouldTrackEffects && fiber.alternate === null) {
			fiber.flags |= Placement;
		}
		return fiber;
	}

	/**
	 * @param returnFiber 父节点 的 fiber node
	 * @param currentFiber 子节点 的 current fiber node
	 * @param newChild 子节点 的 ReactElement
	 */
	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: ReactElementType
	) {
		// 判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			switch (newChild.$$typeof) {
				case REACT_ELEMENT_TYPE:
					return placeSingleChild(
						reconcileSingleElement(returnFiber, currentFiber, newChild)
					);
				default:
					if (__DEV__) {
						console.warn('未实现的reconcile类型', newChild);
					}
					break;
			}
		}
		// TODO 多节点的情况 ul> li*3

		// HostText
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}
		if (currentFiber !== null) {
			// 兜底删除
			deleteChild(returnFiber, currentFiber);
		}

		if (__DEV__) {
			console.warn('未实现的reconcile类型', newChild);
		}
		return null;
	};
}

/**
 * @description 一个辅助函数，用于在复用现有 fiber 时为其创建一个 wip 的副本。
 * @param fiber 使用 reconcileChildFibers 作用域的 currentFiber， current tree对应的的子节点
 * @param pendingProps
 * @returns
 */
function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
	const clone = createWorkInProgress(fiber, pendingProps);
	clone.index = 0;
	clone.sibling = null;
	return clone;
}

export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false);
