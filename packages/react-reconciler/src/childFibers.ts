/**
 * 负责处理一个父 Fiber 节点的子节点的协调（reconciliation）工作
 */
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import { Key, Props, ReactElementType } from 'shared/ReactTypes';
import {
	createFiberFromElement,
	createFiberFromFragment,
	createWorkInProgress,
	FiberNode
} from './fiber';
import { ChildDeletion, Placement } from './fiberFlags';
import { HostText, Fragment } from './workTags';

type ExistingChildren = Map<string | number, FiberNode>;

/**
 * @function ChildReconciler
 * @description 一个工厂函数，用于创建子节点协调器函数。
 *              根据 `shouldTrackEffects` 参数，返回的协调器函数在协调过程中
 *              会（或不会）追踪副作用（如 `Placement`, `ChildDeletion`）。
 *              - 当 `shouldTrackEffects` 为 `true` (通常用于更新已存在的组件树)，
 *                协调器会比较新旧子节点，并标记需要进行的 DOM 操作 (如移动、删除、插入)。
 *              - 当 `shouldTrackEffects` 为 `false` (通常用于组件树的首次挂载)，
 *                协调器主要负责创建新的子 Fiber 节点，而不会标记删除等副作用，
 *                因为所有新节点都需要被放置。
 *
 * @param {boolean} shouldTrackEffects - 指示返回的协调器函数是否应该追踪副作用。
 * @returns {(returnFiber: FiberNode, currentFirstChild: FiberNode | null, newChild?: any) => FiberNode | null}
 *          返回一个子节点协调函数。该函数接收父 Fiber 节点 (`returnFiber`)、
 *          当前（旧的）第一个子 Fiber 节点 (`currentFirstChild`) 以及新的子节点 (`newChild`)，
 *          然后执行协调逻辑，并返回新创建或复用的第一个子 work-in-progress Fiber 节点。
 */
function ChildReconciler(shouldTrackEffects: boolean) {
	/**
	 * @description 将一个 fiber 子节点标记为删除
	 * @param returnFiber - 使用 reconcileChildFibers 作用域的 returnFiber， wip的父节点
	 * @param childToDelete  - 使用 reconcileChildFibers 作用域的 currentFiber， current tree对应的的子节点
	 * @see {@link reconcileChildFibers}
	 * @returns
	 */
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
		// 如果不在追踪副作用，就没必要追踪删除，例如在初始挂载时，没有旧东西可删
		if (!shouldTrackEffects) {
			return;
		}

		const deletions = returnFiber.deletions;
		if (deletions === null) {
			returnFiber.deletions = [childToDelete];
			returnFiber.flags |= ChildDeletion;
		} else {
			deletions.push(childToDelete);
		}
	}
	/**
	 * @description 在组件更新时，遍历并标记从某个旧的子 Fiber 节点开始的所有后续兄弟节点，以便在提交阶段将它们从 DOM 中移除
	 * @param returnFiber work-in-progress 树中的父节点
	 * @param currentFirstChild current tree 中，需要开始删除的第一个子 Fiber 节点
	 */
	function deleteRemainingChildren(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null
	) {
		// 在挂载阶段没有旧节点需要删除，所以如果 `shouldTrackEffects` 为 `false`，函数直接返回，不做任何操作
		if (!shouldTrackEffects) {
			return;
		}
		// 游标
		let childToDelete = currentFirstChild;
		while (childToDelete !== null) {
			deleteChild(returnFiber, childToDelete);
			childToDelete = childToDelete.sibling;
		}
	}

	/**
	 * @description newChild 是单个 React 元素的情况
	 * @param returnFiber wip的父节点
	 * @param currentFiber 父节点在上一次渲染时的第一个子 Fiber 节点，代表旧的子节点或旧子节点链表的头部
	 * @param element 本次渲染中，父节点的新的、单一的子 React 元素
	 * @returns
	 */
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElementType
	) {
		const key = element.key;

		// 遍历旧的子 Fiber 节点链表，寻找一个可被复用的 currentFiber
		while (currentFiber !== null) {
			// 如果 currentFiber 存在，说明是更新操作，我们尝试复用。
			if (currentFiber.key === key) {
				// key相同
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					if (currentFiber.type === element.type) {
						let props = element.props;

						// fragment 的 props 与其他不同
						if (element.type === REACT_FRAGMENT_TYPE) {
							props = element.props.children;
						}

						// type相同
						const existing = useFiber(currentFiber, props);
						existing.return = returnFiber;

						// 当前节点可复用，标记剩下的节点删除
						deleteRemainingChildren(returnFiber, currentFiber.sibling);
						return existing;
					}
					// key相同，type不同 删掉所有旧的（含 currentFiber ）
					deleteRemainingChildren(returnFiber, currentFiber);
					break;
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型', element);
						break;
					}
				}
			} else {
				// key不同，删掉旧的，移动到下一个旧的兄弟节点，继续尝试匹配
				deleteChild(returnFiber, currentFiber);
				currentFiber = currentFiber.sibling;
			}
		} // while 循环结束

		// 如果代码执行到这里，意味着：
		//    a. 初始的 currentFiber 就是 null (即父节点之前没有子节点，这是首次挂载这个子元素)。
		//    b. 或者，遍历了所有旧的子 Fiber 节点，但没有找到 key 和 type 都匹配的可复用节点。
		//    c. 或者，找到了相同的 key 但 type 不同，导致 break 了循环。
		//    在这些情况下，都需要为新的 element 创建一个全新的 Fiber 节点。

		// 根据element创建fiber
		let fiber;

		// fragment
		if (element.type === REACT_FRAGMENT_TYPE) {
			fiber = createFiberFromFragment(element.props.children, key);
		} else {
			fiber = createFiberFromElement(element);
		}

		fiber.return = returnFiber;
		return fiber;
	}

	/**
	 * @description 专门用于处理文本内容（例如 <div>你好</div> 中的 "你好"）。
	 * @param returnFiber 使用 reconcileChildFibers 作用域的 returnFiber， wip的父节点
	 * @param currentFiber 使用 reconcileChildFibers 作用域的 currentFiber， current tree对应的的子节点
	 * @param content 文本内容
	 * @returns 新创建的或者被复用的 wip，这个 FiberNode 代表了传入的文本内容
	 */
	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		// 1. 检查是否存在上一次渲染的 Fiber 节点 (currentFiber)
		while (currentFiber !== null) {
			// 如果存在，说明是更新操作

			// 2. 检查上一次的 Fiber 节点是否也是一个文本节点
			if (currentFiber.tag === HostText) {
				// 类型没变，可以复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				// 1 2 3 -> 1, 需要删除 2, 3
				deleteRemainingChildren(returnFiber, currentFiber.sibling);
				return existing;
			}
			// 如果 currentFiber 存在，但它的类型不是 HostText
			deleteChild(returnFiber, currentFiber);
			currentFiber = currentFiber.sibling;
		}

		// 3. 没有对应的 Fiber 节点，创建新的文本 Fiber 节点
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}

	/**
	 * @description update 且 current tree 没有对应的的节点时，打上 Placement 标记。
	 * 				mount 时不打标记
	 * @param fiber wip-fiber-node
	 * @returns （可能会）打上 Placement flag 的原 fiber 节点
	 */
	function placeSingleChild(fiber: FiberNode) {
		if (shouldTrackEffects && fiber.alternate === null) {
			fiber.flags |= Placement;
		}
		return fiber;
	}
	/**
	 * @description 对比新的子节点数组 (newChild) 和上一次渲染时的旧子节点链表 (currentFirstChild 开始的链表)，然后生成一个新的 work-in-progress (wip) 子 Fiber 节点链表
	 * @param returnFiber
	 * @param currentFirstChild
	 * @param newChild 存放 ReactElement 的数组
	 * @returns
	 */
	function reconcileChildrenArray(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null,
		newChild: any[]
	) {
		// 最后一个可复用fiber在current中的index
		let lastPlacedIndex = 0;
		// 创建的最后一个fiber
		let lastNewFiber: FiberNode | null = null;
		// 创建的第一个fiber
		let firstNewFiber: FiberNode | null = null;

		// 1.将current保存在map中
		const existingChildren: ExistingChildren = new Map();
		let current = currentFirstChild;
		while (current !== null) {
			const keyToUse = current.key !== null ? current.key : current.index;
			existingChildren.set(keyToUse, current);
			current = current.sibling;
		}

		for (let i = 0; i < newChild.length; i++) {
			// 2.遍历newChild，寻找是否可复用
			const after = newChild[i];
			const newFiber = updateFromMap(returnFiber, existingChildren, i, after);

			if (newFiber === null) {
				continue;
			}

			// 3. 标记移动还是插入
			newFiber.index = i;
			newFiber.return = returnFiber;

			if (lastNewFiber === null) {
				lastNewFiber = newFiber;
				firstNewFiber = newFiber;
			} else {
				lastNewFiber.sibling = newFiber;
				lastNewFiber = lastNewFiber.sibling;
			}

			if (!shouldTrackEffects) {
				continue;
			}

			const current = newFiber.alternate;
			if (current !== null) {
				const oldIndex = current.index;
				if (oldIndex < lastPlacedIndex) {
					// 移动
					newFiber.flags |= Placement;
					continue;
				} else {
					// 不移动
					lastPlacedIndex = oldIndex;
				}
			} else {
				// mount
				newFiber.flags |= Placement;
			}
		}
		// 4. 将Map中剩下的标记为删除
		existingChildren.forEach((fiber) => {
			deleteChild(returnFiber, fiber);
		});
		return firstNewFiber;
	}

	function getElementKeyToUse(element: any, index?: number): Key {
		if (
			Array.isArray(element) ||
			typeof element === 'string' ||
			typeof element === 'number' ||
			element === undefined ||
			element === null
		) {
			return index;
		}
		return element.key !== null ? element.key : index;
	}

	/**
	 * @description 尝试从旧节点中找出可复用的，基于此创建 wip 节点
	 * @param returnFiber 父节点
	 * @param existingChildren Map，存储旧节点，[key, fiberNode]
	 * @param index 当前新子元素在 newChild 数组的索引
	 * @param element 新子元素
	 * @returns
	 */
	function updateFromMap(
		returnFiber: FiberNode,
		existingChildren: ExistingChildren,
		index: number,
		element: any
	): FiberNode | null {
		const keyToUse = getElementKeyToUse(element, index);
		const before = existingChildren.get(keyToUse);

		// HostText
		if (typeof element === 'string' || typeof element === 'number') {
			if (before) {
				if (before.tag === HostText) {
					existingChildren.delete(keyToUse);
					return useFiber(before, { content: element + '' });
				}
			}
			return new FiberNode(HostText, { content: element + '' }, null);
		}

		// ReactElement
		if (typeof element === 'object' && element !== null) {
			switch (element.$$typeof) {
				case REACT_ELEMENT_TYPE:
					// fragment 情况2: Fragment与其他组件同级
					if (element.type === REACT_FRAGMENT_TYPE) {
						return updateFragment(
							returnFiber,
							before,
							element,
							keyToUse,
							existingChildren
						);
					}
					if (before) {
						if (before.type === element.type) {
							existingChildren.delete(keyToUse);
							return useFiber(before, element.props);
						}
					}
					return createFiberFromElement(element);
			}

			// TODO 数组类型
			if (Array.isArray(element) && __DEV__) {
				console.warn('还未实现数组类型的child');
			}
		}
		if (Array.isArray(element)) {
			return updateFragment(
				returnFiber,
				before,
				element,
				keyToUse,
				existingChildren
			);
		}
		return null;
	}

	/**
	 * @param returnFiber 父节点 的 fiber node
	 * @param currentFiber 子节点 的 current fiber node
	 * @param newChild 子节点 的 ReactElement
	 */
	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: any
	) {
		// Fragment 情况1: Fragment 包裹其他组件
		// 例子：<> <ChildA /><ChildB /> </>
		const isUnkeyedTopLevelFragment =
			typeof newChild === 'object' &&
			newChild !== null &&
			newChild.type === REACT_FRAGMENT_TYPE &&
			newChild.key === null;
		if (isUnkeyedTopLevelFragment) {
			newChild = newChild.props.children; // [<ChildA />, <ChildB />]
		}

		// 判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			// 多节点的情况 ul> li*3
			if (Array.isArray(newChild)) {
				return reconcileChildrenArray(returnFiber, currentFiber, newChild);
			}
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

		// HostText
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}

		deleteRemainingChildren(returnFiber, currentFiber);

		return null;
	};
}

/**
 * @description -
 * * 作用：基于这个 旧节点 和 新的 props 创建一个对应的 wip fiber node 的副本
 * * 流程：1. 通过 `createWorkInProgress()` 制作出新节点 2. 添加树状结构
 * @param fiber
 * @param pendingProps
 * @returns
 * * 副本的结构
 * 	* 实例: 赋值, 来自于传入的 fiber
 * 	* 树形结构: 赋值,index = 0, sibling = null
 * 	* 工作单元: 赋值，数据来自 `fiber & pendingProps`
 * 	* 副作用: 重置
 */
function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
	const clone = createWorkInProgress(fiber, pendingProps);
	clone.index = 0;
	clone.sibling = null;
	return clone;
}

/**
 * @description 当在协调子节点数组（通过 reconcileChildrenArray -> updateFromMap）时遇到一个 Fragment 类型的 React 元素时，它会判断是否可以复用旧的 Fragment Fiber 节点。如果可以，就复用并更新；如果不可以，就创建一个新的 Fragment Fiber 节点。最终返回这个代表 Fragment 的 Fiber 节点。
 * @param returnFiber
 * @param current
 * @param elements
 * @param key
 * @param existingChildren
 * @returns
 */
function updateFragment(
	returnFiber: FiberNode,
	current: FiberNode | undefined,
	elements: any[],
	key: Key,
	existingChildren: ExistingChildren
) {
	let fiber;

	// 判断是否可以复用旧的 Fragment Fiber 节点
	if (!current || current.tag !== Fragment) {
		// 不能复用
		fiber = createFiberFromFragment(elements, key);
	} else {
		// 可以复用
		existingChildren.delete(key);
		fiber = useFiber(current, elements);
	}
	fiber.return = returnFiber;
	return fiber;
}

export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false);

/**
 * @function cloneChildFibers
 * @description 为给定的 work-in-progress (WIP) Fiber 节点 `wip` 克隆其完整的子 Fiber 节点链表。
 *              当父 Fiber 节点 `wip` 可以在 `beginWork` 阶段进行 bailout 优化（即父节点本身不需要重新渲染），
 *              但其子树中可能仍有待处理的工作（例如，子节点有自己的更新或 context 变化）时，
 *              此函数被调用。它会遍历 `wip` 的原始子节点 (从 `wip.child` 开始及其所有兄弟节点)，
 *              并为每个原始子节点创建一个对应的 WIP Fiber 节点副本。
 *              这些新的 WIP 子节点会被正确地链接（通过 `child` 和 `sibling` 指针），
 *              并设置其 `return` 指针指向 `wip`。
 *
 * @param {FiberNode} wip - 父 work-in-progress Fiber 节点，其子节点链表将被克隆。
 */
export function cloneChildFibers(wip: FiberNode) {
	// child  sibling
	if (wip.child === null) {
		return;
	}
	let currentChild = wip.child;
	let newChild = createWorkInProgress(currentChild, currentChild.pendingProps);
	wip.child = newChild;
	newChild.return = wip;

	while (currentChild.sibling !== null) {
		currentChild = currentChild.sibling;
		newChild = newChild.sibling = createWorkInProgress(
			newChild,
			newChild.pendingProps
		);
		newChild.return = wip;
	}
}
