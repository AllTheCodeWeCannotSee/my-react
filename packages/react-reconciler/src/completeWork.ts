//
import {
	appendInitialChild,
	Container,
	createInstance,
	createTextInstance,
	Instance
} from 'hostConfig';
import { FiberNode } from './fiber';
import { NoFlags, Update } from './fiberFlags';
import {
	HostRoot,
	HostText,
	HostComponent,
	FunctionComponent,
	Fragment
} from './workTags';

/**
 * @description 给传入的 fiber 节点的 flags 属性添加上 Update 标记。
 * @param fiber wip fiber node
 */
function markUpdate(fiber: FiberNode) {
	// |= 是按位或赋值操作，确保在不丢失原有 flags 的情况下添加新的 Update 标记。
	fiber.flags |= Update;
}

/**
 * @description -
 * * 创建/更新 DOM 实例
 * * 副作用标记冒泡
 * @param wip
 * @returns
 */
export const completeWork = (wip: FiberNode) => {
	const newProps = wip.pendingProps;
	// 获取与当前 wip Fiber 对应的 current Fiber (上一次渲染的 Fiber 节点). 如果 current 为 null，表示这是一个全新的节点 (挂载阶段)
	const current = wip.alternate;

	switch (wip.tag) {
		case HostComponent:
			if (current !== null && wip.stateNode) {
				// TODO update
				// 1. props是否变化 {onClick: xx} {onClick: xxx}
				// 2. 变了 Update flag
				// className style
				markUpdate(wip);
			} else {
				// 如果是新节点
				const instance = createInstance(wip.type, newProps);

				appendAllChildren(instance, wip);
				wip.stateNode = instance;
			}
			bubbleProperties(wip);
			return null;

		case HostText:
			if (current !== null && wip.stateNode) {
				const oldText = current.memoizedProps?.content;
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
			bubbleProperties(wip);
			return null;

		case HostRoot:
		case FunctionComponent:
		case Fragment:
			bubbleProperties(wip);
			return null;

		// 如果遇到未处理的 Fiber 类型
		default:
			if (__DEV__) {
				console.warn('未处理的completeWork情况', wip);
			}
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
function appendAllChildren(parent: Container | Instance, wip: FiberNode) {
	// node 作为遍历的指针
	let node = wip.child;

	while (node !== null) {
		if (node.tag === HostComponent || node.tag === HostText) {
			// 如果是，说明这个 node 对应一个真实的 DOM 元素或文本节点 (存储在 node.stateNode 中)
			appendInitialChild(parent, node?.stateNode);
		} else if (node.child !== null) {
			node.child.return = node;
			// 将 node 指向其子节点，实现向下遍历。
			node = node.child;
			continue;
		}

		// 这是一个安全检查或终止条件。如果 node 意外地变回了最初的 wip 父节点，
		// 说明遍历可能出现了问题或已经完成，此时函数返回。
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
		node = node.sibling;
	}
}

/**
 * @description 它把所有这些从子孙节点收集到的标记信息，汇总起来，然后统一记录在当前 wip 节点的 subtreeFlags 属性上
 */
function bubbleProperties(wip: FiberNode) {
	let subtreeFlags = NoFlags;
	let child = wip.child;

	while (child !== null) {
		subtreeFlags |= child.subtreeFlags;
		subtreeFlags |= child.flags;

		// 确保子节点的 return 指针正确地指向 wip (当前父节点)
		// 这一步主要是为了维护 Fiber 树结构的正确性，
		// 尽管在其他地方可能已经设置过，但这里可以作为一种保障。
		child.return = wip;
		child = child.sibling;
	}
	wip.subtreeFlags |= subtreeFlags;
}
