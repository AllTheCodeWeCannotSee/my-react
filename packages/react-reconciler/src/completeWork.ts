import {
	appendInitialChild,
	Container,
	createInstance,
	createTextInstance
} from 'hostConfig';
import { FiberNode } from './fiber';
import { NoFlags, Update } from './fiberFlags';
import {
	HostRoot,
	HostText,
	HostComponent,
	FunctionComponent
} from './workTags';
import { updateFiberProps } from 'react-dom/src/SyntheticEvent';

/**
 * @description 给传入的 fiber 节点的 flags 属性添加上 Update 标记。
 * @param fiber wip fiber node
 */
function markUpdate(fiber: FiberNode) {
	// |= 是按位或赋值操作，确保在不丢失原有 flags 的情况下添加新的 Update 标记。
	fiber.flags |= Update;
}

/**
 * @description completeWork 函数在 React 的协调（或渲染）阶段，当一个 Fiber 节点（wip）的所有子节点都已经被处理完毕后被调用
 * @param wip
 * @returns
 */
export const completeWork = (wip: FiberNode) => {
	const newProps = wip.pendingProps;
	// 2. 获取与当前 wip Fiber 对应的 current Fiber (上一次渲染的 Fiber 节点). 如果 current 为 null，表示这是一个全新的节点 (挂载阶段)
	const current = wip.alternate;

	switch (wip.tag) {
		// 4. 如果是宿主组件 (HostComponent)，例如 <div>, <p> 等HTML元素
		case HostComponent:
			// 5. 检查是否是更新过程 (current 存在) 并且真实 DOM 元素已创建 (wip.stateNode 存在)
			if (current !== null && wip.stateNode) {
				// 处理 DOM 属性的更新。
				updateFiberProps(wip.stateNode, newProps);
			} else {
				// 7. 挂载路径：如果是新节点
				//    7a. 调用 hostConfig 中的 createInstance 函数，根据 wip.type (例如 "div")
				//        创建一个真实的 DOM 元素实例。
				const instance = createInstance(wip.type, newProps);
				//    7b. 调用 appendAllChildren 函数，将 wip 节点的所有子孙后代中
				//        实际的 DOM 节点（或文本节点）附加到刚刚创建的 instance (父DOM元素) 上。
				appendAllChildren(instance, wip);
				//    7c. 将创建的真实 DOM 元素实例保存在当前 wip Fiber 节点的 stateNode 属性上。
				wip.stateNode = instance;
			}
			// 8. 调用 bubbleProperties 函数，将子节点的副作用标记冒泡到当前节点的 subtreeFlags。
			bubbleProperties(wip);
			// 9. completeWork 通常返回 null，表示当前 Fiber 节点的工作已经完成，
			//    协调器应该继续处理其兄弟节点或父节点。
			return null;

		// 10. 如果是宿主文本节点 (HostText)
		case HostText:
			// 11. 检查是否是更新过程且真实 DOM 文本节点已创建
			if (current !== null && wip.stateNode) {
				// 12. 更新路径：
				//     12a. 获取旧的文本内容。
				const oldText = current.memoizedProps?.content;
				//     12b. 获取新的文本内容。
				const newText = newProps.content;
				//     12c. 如果文本内容发生了变化，就调用 markUpdate 标记该 Fiber 节点，
				//          以便在提交阶段更新真实 DOM 文本节点的内容。
				if (oldText !== newText) {
					markUpdate(wip);
				}
			} else {
				// 13. 挂载路径：如果是新文本节点
				//     13a. 调用 hostConfig 中的 createTextInstance 函数，
				//          根据 newProps.content 创建一个真实的 DOM 文本节点实例。
				const instance = createTextInstance(newProps.content);
				//     13b. 将创建的文本节点实例保存在 stateNode 上。
				wip.stateNode = instance;
			}
			// 14. 冒泡子节点的副作用标记 (对于文本节点，通常没有子节点，但保持一致性)
			bubbleProperties(wip);
			// 15. 返回 null
			return null;

		// 16. 如果是 Fiber 树的根节点 (HostRoot)
		case HostRoot:
			// 17. 对于根节点，completeWork 主要也是进行属性冒泡。
			bubbleProperties(wip);
			// 18. 返回 null
			return null;

		// 19. 如果是函数组件 (FunctionComponent)
		case FunctionComponent:
			// 20. 函数组件本身不直接对应 DOM 节点。它们的主要工作
			//     (执行函数本身并返回子元素) 是在 beginWork 阶段完成的。
			//     在 completeWork 阶段，对于函数组件，主要也是进行属性冒泡。
			bubbleProperties(wip);
			// 21. 返回 null
			return null;

		// 22. 如果遇到未处理的 Fiber 类型
		default:
			// 23. 并且在开发环境 (__DEV__) 下，会打印一个警告。
			if (__DEV__) {
				console.warn('未处理的completeWork情况', wip);
			}
			// 24. 结束 switch 语句的这个 case
			break;
	}
};

/**
 * @description
 * * 主要任务是构建真实的 DOM 树层级关系
 * * 遍历这个 wip 父 Fiber 节点的所有子孙后代 Fiber 节点，找到那些代表真实 DOM 元素或文本节点的 Fiber（即 HostComponent 或 HostText 类型的 Fiber），并将它们对应的真实 DOM 节点（存储在 stateNode 属性中）依次附加到 parent DOM 元素上。
 * @param parent 真实 DOM 元素
 * @param wip 该DOM元素对应的fiber-node
 */
function appendAllChildren(parent: Container, wip: FiberNode) {
	// 1. 从 wip (当前父 Fiber 节点) 的第一个子 Fiber 节点开始遍历
	// node 作为遍历的指针
	let node = wip.child;

	// 2. 持续循环，直到 wip 的所有子孙节点都被处理完毕
	while (node !== null) {
		// 3. 检查当前遍历到的 node 是否是宿主组件 (HostComponent) 或宿主文本节点 (HostText)
		if (node.tag === HostComponent || node.tag === HostText) {
			// 4. 如果是，说明这个 node 对应一个真实的 DOM 元素或文本节点 (存储在 node.stateNode 中)
			//    调用 appendInitialChild 函数 (来自 hostConfig)，
			//    将这个真实的 DOM 节点 (node.stateNode) 添加为 parent (父 DOM 元素) 的子节点。
			//    node?.stateNode 使用了可选链，以防 stateNode 意外为 null (虽然理论上此时不应为 null)。
			appendInitialChild(parent, node?.stateNode);
		} else if (node.child !== null) {
			// 5. 如果当前 node 不是直接的宿主节点 (例如，它可能是一个函数组件)，
			//    并且它拥有自己的子节点 (node.child !== null)，
			//    这意味着我们需要更深入地遍历这个 node 的子树，以找到可附加的真实 DOM 节点。
			// 6. 确保这个更深层子节点的 return 指针指向其直接父 Fiber (node)。
			//    这有助于维护 Fiber 树结构的正确性。
			node.child.return = node;

			// 7. 将 node 指向其子节点，实现向下遍历。
			node = node.child;

			// 8. 使用 continue 跳过本次循环的后续部分 (兄弟节点和回溯逻辑)，
			//    直接从这个更深层的子节点开始新一轮的循环。
			continue;
		}

		// 9. 这是一个安全检查或终止条件。如果 node 意外地变回了最初的 wip 父节点，
		//    说明遍历可能出现了问题或已经完成，此时函数返回。
		if (node === wip) {
			return;
		}

		// 10. 如果当前 node 没有兄弟节点了 (node.sibling === null)，
		//     意味着当前层级的子节点都处理完了，需要向上回溯到父节点，
		//     然后尝试处理父节点的兄弟节点（即当前节点的“叔叔”节点）。
		while (node.sibling === null) {
			// 11. 在回溯过程中，如果 node.return 为 null (到达 Fiber 树的根，不应发生在此函数内)
			//     或者 node.return 等于最初的 wip 父节点，
			//     说明 wip 的所有子孙节点都已处理完毕，函数可以返回。
			if (node.return === null || node.return === wip) {
				return;
			}

			// 12. node 指向其父 Fiber 节点，实现向上回溯。
			node = node?.return;
		}

		// 13. 当从内部循环（步骤 10-12）跳出时，说明当前 node 找到了一个兄弟节点。
		//     确保这个兄弟节点的 return 指针指向正确的父节点 (node.return，即当前回溯到的父节点)。
		node.sibling.return = node.return;
		// 14. 将 node 指向其兄弟 Fiber 节点，以便在下一次主循环 (步骤 2) 中处理这个兄弟分支。
		node = node.sibling;
	}
}

/**
 * @description 它把所有这些从子孙节点收集到的标记信息，汇总起来，然后统一记录在当前 wip 节点的 subtreeFlags 属性上
 */
function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags; // 1. 初始化一个变量，用来累积所有子孙节点的副作用标记
	let child = wip.child; // 2. 从 wip (当前工作中的父 Fiber 节点) 的第一个子 Fiber 节点开始

	// 3. 遍历 wip 节点的所有直接子节点
	while (child !== null) {
		// 4. 将子节点自身的 subtreeFlags (代表子节点的整个子树中存在的副作用)
		//    合并到父节点的 subtreeFlags 累积变量中
		subtreeFlags |= child.subtreeFlags;

		// 5. 将子节点自身的 flags (代表子节点本身需要执行的副作用)
		//    也合并到父节点的 subtreeFlags 累积变量中
		//    因为子节点自身的副作用也是其父节点子树中的一部分需要关注的变更
		subtreeFlags |= child.flags;

		// 6. 确保子节点的 return 指针正确地指向 wip (当前父节点)
		//    这一步主要是为了维护 Fiber 树结构的正确性，
		//    尽管在其他地方可能已经设置过，但这里可以作为一种保障。
		child.return = wip;

		// 7. 移动到下一个兄弟节点，继续循环
		child = child.sibling;
	}

	// 8. 最后，将累积到的所有子孙节点的副作用标记 (subtreeFlags)
	//    合并到 wip 节点自身的 subtreeFlags 属性上。
	//    这样，wip.subtreeFlags 就包含了它所有子孙节点中存在的全部副作用标记。
	wip.subtreeFlags |= subtreeFlags;
}
