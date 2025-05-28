import {
	appendChildToContainer,
	commitUpdate,
	Container,
	insertChildToContainer,
	Instance,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode, PendingPassiveEffects } from './fiber';
import {
	ChildDeletion,
	Flags,
	MutationMask,
	NoFlags,
	PassiveEffect,
	PassiveMask,
	Placement,
	Update
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { Effect, FCUpdateQueue } from './fiberHooks';
import { HookHasEffect } from './hookEffectTags';

let nextEffect: FiberNode | null = null;

/**
 * @function commitMutationEffects
 * @description 遍历 "finishedWork" Fiber 树（代表已完成的渲染工作），并执行所有与 DOM 结构变更相关的副作用。
 *              这些副作用包括：
 *              - Placement (插入)：将新的 DOM 节点添加到页面上。
 *              - Update (更新)：修改现有 DOM 节点的属性或文本内容。
 *              - ChildDeletion (子节点删除)：从 DOM 中移除不再需要的节点。
 *              - PassiveEffect (被动副作用)：收集函数组件中由 `useEffect` 产生的回调，
 *                这些回调将在稍后的 `flushPassiveEffects` 阶段执行。
 *
 *              此函数采用深度优先的遍历策略：
 *              1. 它首先尝试向下遍历到子节点。
 *              2. 如果一个节点没有子节点，或者其子树中没有需要处理的“变更类”或“被动类”副作用，
 *                 则会处理该节点自身的副作用。
 *              3. 处理完当前节点后，尝试移动到其兄弟节点。
 *              4. 如果没有兄弟节点，则向上回溯到父节点，并处理父节点的副作用。
 *              这个过程会持续进行，直到遍历并处理完 `finishedWork` 树中所有带有相关副作用标记的节点。
 *
 * @param {FiberNode} finishedWork - 已经完成工作的 Fiber 树的根节点 (work-in-progress 树)。
 *                                   这个树包含了所有需要应用的变更信息。
 * @param {FiberRootNode} root - FiberRootNode 实例，代表整个应用的根。
 *                               它用于在处理副作用时（例如收集被动副作用）访问全局信息。
 */
export const commitMutationEffects = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	//nextEffect 将作为遍历 Fiber 树以执行副作用的游标。
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		// 向下遍历
		const child: FiberNode | null = nextEffect.child;

		// 检查当前 nextEffect 节点的子树中是否存在“变更类”副作用，并且它有子节点。
		if (
			(nextEffect.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags &&
			child !== null
		) {
			// 如果子树中有变更，并且有子节点，则将 nextEffect 指向其第一个子节点，
			nextEffect = child;
		} else {
			// 向上遍历
			up: while (nextEffect !== null) {
				commitMutaitonEffectsOnFiber(nextEffect, root);

				const sibling: FiberNode | null = nextEffect.sibling;
				if (sibling !== null) {
					// 游标指向兄弟节点
					nextEffect = sibling;
					break up;
				}
				nextEffect = nextEffect.return;
			}
		}
	}
};

/**
 * @function commitMutaitonEffectsOnFiber
 * @description 针对单个 Fiber 节点来执行其身上标记的“变更类”副作用（Mutation Effects）
 *              以及收集被动副作用（Passive Effects）。
 *              “变更类”副作用指的是那些会直接修改 DOM 结构的操作，比如插入新节点（Placement）、
 *              更新现有节点（Update）、删除节点（ChildDeletion）。
 *              被动副作用指的是由 `useEffect` 产生的回调，它们会被收集起来稍后执行。
 *
 *              此函数会检查 `finishedWork` 节点的 `flags` 属性，并根据不同的标记执行相应的操作：
 *              - **Placement**: 调用 `commitPlacement` 执行 DOM 插入。
 *              - **Update**: 调用 `hostConfig.commitUpdate` 执行 DOM 属性或文本内容的更新。
 *              - **ChildDeletion**: 遍历 `finishedWork.deletions` 数组，对每个需要删除的子节点
 *                调用 `commitDeletion` 来执行实际的 DOM 移除和相关的清理工作。
 *              - **PassiveEffect**: 调用 `commitPassiveEffect` 来收集 `useEffect` 的回调，
 *                以便在 `flushPassiveEffects` 阶段执行。
 *
 *              每处理完一种副作用后，会从 `finishedWork.flags` 中移除对应的标记，
 *              以防止重复执行。
 *
 * @param {FiberNode} finishedWork - 当前正在处理的、已经完成工作的 Fiber 节点。
 *                                   它的 `flags` 属性可能包含上述一种或多种副作用标记。
 * @param {FiberRootNode} root - FiberRootNode 实例，代表整个应用的根。
 *                               在处理某些副作用（如收集被动副作用或执行删除）时需要用到。
 */
const commitMutaitonEffectsOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const flags = finishedWork.flags;

	// 检查是否包含 Placement (放置/插入) 标记
	if ((flags & Placement) !== NoFlags) {
		commitPlacement(finishedWork);

		// 移除 Placement 标记
		finishedWork.flags &= ~Placement;
	}

	// 检查是否包含 Update (更新) 标记
	if ((flags & Update) !== NoFlags) {
		commitUpdate(finishedWork);
		// 移除 Update 标记。
		finishedWork.flags &= ~Update;
	}

	// 检查是否包含 ChildDeletion (子节点删除) 标记
	if ((flags & ChildDeletion) !== NoFlags) {
		const deletions = finishedWork.deletions;
		if (deletions !== null) {
			deletions.forEach((childToDelete) => {
				commitDeletion(childToDelete, root);
			});
		}
		// 移除 ChildDeletion 标记
		finishedWork.flags &= ~ChildDeletion;
	}

	// 检查是否包含 PassiveEffect (effect) 标记
	if ((flags & PassiveEffect) !== NoFlags) {
		// 收集回调
		commitPassiveEffect(finishedWork, root, 'update');
		// 移除 PassiveEffect 标记
		finishedWork.flags &= ~PassiveEffect;
	}
};

/**
 * @function commitPassiveEffect
 * @description 收集函数组件中需要执行的被动副作用 (useEffect)，
 *              并将它们添加到 FiberRootNode 的 pendingPassiveEffects 队列中。
 *              这个函数在 commit 阶段的 "mutation" 子阶段被调用，
 *              它本身不执行 useEffect 的回调，而是将 Effect 对象收集起来，
 *              以便在稍后的 `flushPassiveEffects` 阶段统一执行。
 *
 * @param {FiberNode} fiber - 当前正在处理的 Fiber 节点。
 *                            只有当它是 FunctionComponent 类型，并且在更新时带有 PassiveEffect 标记时，
 *                            才会处理其副作用。
 * @param {FiberRootNode} root - FiberRootNode 实例，代表整个应用的根。
 *                               `pendingPassiveEffects` 队列就存储在这个对象上。
 * @param {'update' | 'unmount'} type - 指示当前是处理更新时的副作用还是卸载时的副作用。
 *                                      - 'update': 表示组件正在更新或首次挂载，需要收集创建回调。
 *                                      - 'unmount': 表示组件正在卸载，需要收集销毁回调。
 */
function commitPassiveEffect(
	fiber: FiberNode,
	root: FiberRootNode,
	type: keyof PendingPassiveEffects
) {
	// update unmount
	if (
		fiber.tag !== FunctionComponent ||
		(type === 'update' && (fiber.flags & PassiveEffect) === NoFlags)
	) {
		return;
	}
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue !== null) {
		if (updateQueue.lastEffect === null && __DEV__) {
			console.error('当FC存在PassiveEffect flag时，不应该不存在effect');
		}
		root.pendingPassiveEffects[type].push(updateQueue.lastEffect as Effect);
	}
}

/**
 * @function commitHookEffectList
 * @description 遍历一个 Effect 对象的循环链表，并对链表中那些 `tag` 属性
 *              与传入的 `flags` 参数匹配的 Effect 对象执行一个指定的回调函数。
 *              这个函数是处理 useEffect Hook 副作用（如执行创建或销毁函数）的通用辅助函数。
 *
 * @param {Flags} flags - 一个位掩码，用于筛选需要处理的 Effect 对象。
 *                        只有当 Effect 对象的 `tag` 属性通过按位与操作 (`&`)
 *                        包含所有在 `flags` 中设置的位时，该 Effect 对象才会被处理。
 *                        例如，如果 flags 是 `Passive | HookHasEffect`，则只有同时具有
 *                        `Passive` 和 `HookHasEffect` 标记的 Effect 对象才会匹配。
 * @param {Effect} lastEffect - Effect 循环链表中的最后一个 Effect 对象。
 *                              函数会从 `lastEffect.next` (即链表的第一个 Effect) 开始遍历。
 *                              这个链表通常存储在函数组件 FiberNode 的 `updateQueue.lastEffect` 中。
 * @param {(effect: Effect) => void} callback - 一个回调函数，它会接收每个匹配条件的 Effect 对象作为参数。
 *                                             这个回调函数负责执行具体的操作，例如调用 Effect 的
 *                                             `create` 或 `destroy` 方法。
 */
function commitHookEffectList(
	flags: Flags,
	lastEffect: Effect,
	callback: (effect: Effect) => void
) {
	let effect = lastEffect.next as Effect;

	do {
		if ((effect.tag & flags) === flags) {
			callback(effect);
		}
		effect = effect.next as Effect;
	} while (effect !== lastEffect.next);
}

/**
 * @function commitHookEffectListUnmount
 * @description 遍历 Effect 循环链表，执行所有匹配指定 `flags` (通常是 `Passive`) 的 Effect 对象的销毁函数。
 *              这个函数主要用于组件卸载时，清理所有相关的 `useEffect` 副作用。
 *              在执行销毁函数后，它还会从 Effect 的 `tag` 中移除 `HookHasEffect` 标记，
 *              表示该 Effect 的销毁回调已被处理。
 *
 * @param {Flags} flags - 用于筛选需要执行销毁回调的 Effect 对象的标记。
 *                        通常是 `Passive`，表示处理所有被动副作用的销毁。
 * @param {Effect} lastEffect - Effect 循环链表中的最后一个 Effect 对象。
 */
export function commitHookEffectListUnmount(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			destroy();
		}
		effect.tag &= ~HookHasEffect;
	});
}

/**
 * @function commitHookEffectListDestroy
 * @description 遍历 Effect 循环链表，执行所有匹配指定 `flags` (通常是 `Passive | HookHasEffect`)
 *              的 Effect 对象的销毁函数。
 *              这个函数主要用于 `useEffect` 依赖项发生变化，需要先清理旧的副作用，
 *              然后再执行新的副作用创建函数的场景。
 *              它只执行销毁函数，不修改 Effect 的 `tag`。
 *
 * @param {Flags} flags - 用于筛选需要执行销毁回调的 Effect 对象的标记。
 *                        通常是 `Passive | HookHasEffect`，表示处理那些在本次更新中
 *                        需要被重新触发（因此旧的需要销毁）的被动副作用。
 * @param {Effect} lastEffect - Effect 循环链表中的最后一个 Effect 对象。
 */
export function commitHookEffectListDestroy(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			destroy();
		}
	});
}

/**
 * @function commitHookEffectListCreate
 * @description 遍历 Effect 循环链表，执行所有匹配指定 `flags` (通常是 `Passive | HookHasEffect`)
 *              的 Effect 对象的创建函数。
 *              这个函数主要用于组件首次挂载或 `useEffect` 依赖项发生变化，需要执行新的副作用创建函数的场景。
 *              执行创建函数后，如果创建函数返回了一个清理函数，该清理函数会被赋值给 Effect 对象的 `destroy` 属性。
 *
 * @param {Flags} flags - 用于筛选需要执行创建回调的 Effect 对象的标记。
 *                        通常是 `Passive | HookHasEffect`，表示处理那些在本次更新中
 *                        需要被触发的被动副作用。
 * @param {Effect} lastEffect - Effect 循环链表中的最后一个 Effect 对象。
 */
export function commitHookEffectListCreate(flags: Flags, lastEffect: Effect) {
	commitHookEffectList(flags, lastEffect, (effect) => {
		const create = effect.create;
		if (typeof create === 'function') {
			effect.destroy = create();
		}
	});
}

/**
 * @description 收集一个列表，这个列表包含了那些互为兄弟节点、并且是需要从它们共同的 DOM 父节点中被显式移除的直接 Host 子 Fiber 节点
 * @param childrenToDelete 一个数组（从 commitDeletion 通过引用传递过来），用于累积需要删除的宿主 Fiber 节点
 * @param unmountFiber
 */
function recordHostChildrenToDelete(
	childrenToDelete: FiberNode[],
	unmountFiber: FiberNode
) {
	// 1. 找到第一个root host节点
	const lastOne = childrenToDelete[childrenToDelete.length - 1];

	if (!lastOne) {
		childrenToDelete.push(unmountFiber);
	} else {
		let node = lastOne.sibling;
		while (node !== null) {
			if (unmountFiber === node) {
				childrenToDelete.push(unmountFiber);
			}
			node = node.sibling;
		}
	}

	// 2. 每找到一个 host节点，判断下这个节点是不是 1 找到那个节点的兄弟节点
}

/**
 * @description 这个函数负责完整地卸载一个 Fiber 节点 (childToDelete) 及其整个子树
 * * 执行清理逻辑
 * * 从 DOM 中移除
 * * 断开 Fiber 链接
 * @param childToDelete
 */
function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
	const rootChildrenToDelete: FiberNode[] = [];

	// 递归子树
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent: // 如果是宿主组件 (如 <div>)
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				// TODO 解绑ref
				return;
			case HostText: // 如果是宿主文本节点
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				return;
			case FunctionComponent: // 如果是函数组件
				// TODO 解绑ref
				commitPassiveEffect(unmountFiber, root, 'unmount');
				return;
			default:
				if (__DEV__) {
					console.warn('未处理的unmount类型', unmountFiber);
				}
		}
	});

	// 5. 当 commitNestedComponent 执行完毕后，childToDelete 子树中所有节点的
	//    卸载前清理逻辑 (如 componentWillUnmount, useEffect 清理) 应该已经执行。
	//    现在，实际从 DOM 中移除节点。
	if (rootChildrenToDelete.length) {
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			rootChildrenToDelete.forEach((node) => {
				removeChild(node.stateNode, hostParent);
			});
		}
	}
	childToDelete.return = null;
	childToDelete.child = null;
}

/**
 * @description 主要任务是深度优先遍历一个给定的 Fiber 子树（从 root 节点开始），并对子树中的每一个 Fiber 节点执行一个指定的回调函数 onCommitUnmount
 * @param root 代表需要被卸载（unmount）的子树的根 Fiber 节点
 * @param onCommitUnmount 一个回调函数，会对子树中的每个 Fiber 节点调用
 * @returns
 */
function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiber: FiberNode) => void
) {
	// 1. 初始化一个游标 node，指向子树的根节点 root
	let node = root;

	// 2. 开始一个无限循环，这个循环会通过内部的 return 语句来终止
	while (true) {
		// 3. 对当前遍历到的 node 调用 onCommitUnmount 回调函数。
		//    这个回调函数通常用于执行一些卸载前的清理工作，
		//    比如调用组件的 componentWillUnmount 生命周期方法，
		//    或者执行 useEffect 的清理函数。
		onCommitUnmount(node);

		// 4. 检查当前 node 是否有子节点
		if (node.child !== null) {
			// 5. 如果有子节点，说明需要向下遍历。
			//    确保子节点的 return 指针指向当前 node (其父节点)。
			node.child.return = node;
			//    将游标 node 移动到其子节点。
			node = node.child;
			//    使用 continue 跳过本次循环的后续部分，直接开始处理这个子节点。
			continue;
		}

		// 6. 如果代码执行到这里，说明当前 node 没有子节点，或者其子节点都已被处理。
		//    检查当前 node 是否就是最初传入的子树根节点 root。
		if (node === root) {
			// 7. 如果是，说明整个子树（从 root 开始向下）都已经遍历并调用了 onCommitUnmount。
			//    此时，函数可以返回，表示卸载前的遍历和回调执行完毕。
			return;
		}

		// 8. 如果当前 node 不是 root，并且它没有子节点，
		//    那么我们需要尝试移动到它的兄弟节点，或者向上回溯。
		//    这个内部循环处理向上回溯的逻辑。
		while (node.sibling === null) {
			// 9. 如果当前 node 没有兄弟节点，检查它的父节点 (node.return)。
			//    如果父节点为 null (不应在此函数内发生，除非 root 本身是顶级节点且无父)，
			//    或者父节点就是最初的 root 节点，
			//    说明我们已经回溯到了子树的根部，并且该分支已处理完毕，函数可以返回。
			if (node.return === null || node.return === root) {
				return;
			}
			// 10. 如果不满足上述终止条件，将游标 node 移动到其父节点，实现向上回溯。
			node = node.return;
		}

		// 11. 当从内部的 while 循环 (步骤 8-10) 跳出时，
		//     说明当前 node (在回溯后) 找到了一个兄弟节点。
		//     确保这个兄弟节点的 return 指针指向正确的父节点 (node.return)。
		node.sibling.return = node.return;
		// 12. 将游标 node 移动到这个兄弟节点，以便在下一次主循环 (步骤 2) 中处理这个兄弟分支。
		node = node.sibling;
	}
}

/**
 * @function commitPlacement
 * @description 负责处理带有 `Placement` 标记的 Fiber 节点的 DOM 插入操作。
 *              它会找到该 Fiber 节点在 DOM 树中正确的父节点和兄弟节点（如果存在），
 *              然后调用 `insertOrAppendPlacementNodeIntoContainer` 函数将该 Fiber 节点
 *              对应的真实 DOM 内容插入到父 DOM 容器中。
 *
 * @param {FiberNode} finishedWork - 带有 `Placement` 标记的、已经完成工作的 Fiber 节点。
 *                                   这个 Fiber 节点及其子树代表了需要被插入到 DOM 中的新内容。
 * @see {@link getHostParent} - 用于查找 Fiber 节点对应的真实 DOM 父节点。
 * @see {@link getHostSibling} - 用于查找 Fiber 节点对应的真实 DOM 兄弟节点，用于确定插入位置。
 * @see {@link insertOrAppendPlacementNodeIntoContainer} - 实际执行 DOM 插入或追加操作的函数。
 */
const commitPlacement = (finishedWork: FiberNode) => {
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
	}
	// parent DOM
	const hostParent = getHostParent(finishedWork);

	// host sibling
	const sibling = getHostSibling(finishedWork);

	// finishedWork ~~ DOM append parent DOM
	if (hostParent !== null) {
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
	}
};

/**
 * @description 找到一个给定的 Fiber 节点在 DOM 结构中的下一个真实的兄弟 DOM 节点
 * @param fiber
 * @returns
 */
function getHostSibling(fiber: FiberNode) {
	let node: FiberNode = fiber; // 游标

	findSibling: while (true) {
		// 向上查找，直到找到一个有兄弟节点的祖先，或者到达一个宿主类型的父节点或根节点
		while (node.sibling === null) {
			const parent = node.return;

			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				return null;
			}
			node = parent;
		}

		// 当跳出上面的内部 while 循环时，说明当前的 `node` 有一个 `sibling`
		node.sibling.return = node.return;

		// // 将游标 `node` 移动到这个兄弟节点
		node = node.sibling;

		// 向下查找，从这个兄弟节点开始，向下查找第一个实际的 DOM 节点
		while (node.tag !== HostText && node.tag !== HostComponent) {
			// 说明直接 sibling 不是一个 Host 类型
			if ((node.flags & Placement) !== NoFlags) {
				// 不稳定，继续找
				continue findSibling;
			}
			if (node.child === null) {
				continue findSibling;
			} else {
				node.child.return = node;
				node = node.child;
			}
		}

		// 当跳出上面的内部 while 循环时，`node` 应该是一个 HostComponent 或 HostText 类型的 Fiber 节点
		//    如果它没有 Placement 标记，说明它是一个已经存在于 DOM 中的稳定节点，
		//    这就是我们要找的 DOM 兄弟节点，返回它的 `stateNode` (即真实的 DOM 元素或文本节点)。
		if ((node.flags & Placement) === NoFlags) {
			return node.stateNode;
		}
		// 如果这个找到的宿主节点本身也有 Placement 标记，说明它也是新插入的（不稳定的Host节点），
		// 不能作为插入 `fiber` 时的 `before` 参照物。
		// 此时，循环会回到 `findSibling` 的开头，继续尝试从 `node` (当前这个带 Placement 的宿主节点)
		// 的兄弟节点开始查找，或者从其父节点的兄弟节点开始查找。
	}
}

/**
 * @description 从给定的 Fiber 节点开始，向上遍历 Fiber 树，直到找到第一个可以直接作为 DOM 父容器的祖先节点
 * @param fiber
 * @returns
 */
function getHostParent(fiber: FiberNode): Container | null {
	let parent = fiber.return;

	while (parent) {
		const parentTag = parent.tag;
		// HostComponent 比如代表一个 <div>、<span> 等 HTML 标签的 Fiber 节点
		if (parentTag === HostComponent) {
			return parent.stateNode as Container;
		}
		// HostRoot 代表整个 React 应用的根节点的 Fiber
		if (parentTag === HostRoot) {
			return (parent.stateNode as FiberRootNode).container;
		}
		parent = parent.return;
	}
	if (__DEV__) {
		console.warn('未找到host parent');
	}
	return null;
}

/**
 * @function insertOrAppendPlacementNodeIntoContainer
 * @description 将一个指定的 Fiber 节点（`finishedWork`）所代表的真实 DOM 内容，
 *              插入或追加到一个指定的父 DOM 容器（`hostParent`）中。
 *              如果提供了 `before` 参数（一个兄弟 DOM 实例），则会将 `finishedWork` 的 DOM 内容
 *              插入到 `before` 节点之前；否则，会将其追加到 `hostParent` 的末尾。
 *
 *              此函数会递归处理 `finishedWork`：
 *              - 如果 `finishedWork` 本身是一个可以直接渲染到 DOM 的类型（如 `HostComponent` 或 `HostText`），
 *                则直接将其 `stateNode` (真实 DOM 节点) 插入或追加到 `hostParent`。
 *              - 如果 `finishedWork` 是一个组件类型（如 `FunctionComponent`），它本身不对应 DOM 节点，
 *                则会递归地对其子节点调用此函数，将子节点渲染的真实 DOM 内容插入或追加到 `hostParent`。
 *
 * @param {FiberNode} finishedWork - 需要被放置（插入或追加）的 Fiber 节点。
 *                                   它的 `stateNode` 属性（如果是宿主类型）或其子孙节点的 `stateNode`
 *                                   将是实际被操作的 DOM 内容。
 * @param {Container} hostParent - 目标父 DOM 容器，`finishedWork` 的内容将被添加到这里。
 * @param {Instance} [before] - (可选) 一个兄弟 DOM 实例。如果提供此参数，
 *                              `finishedWork` 的 DOM 内容将被插入到这个 `before` 节点之前。
 *                              如果未提供，则 `finishedWork` 的内容将被追加到 `hostParent` 的末尾。
 */

function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode, // 参数 finishedWork：代表需要被“放置”到 DOM 中的 Fiber 节点
	hostParent: Container, // 参数 hostParent：这个 Fiber 节点应该被添加到的父级真实 DOM 容器
	before?: Instance
) {
	// 1. 检查 finishedWork 是否是直接可以渲染到 DOM 的类型
	//    即宿主组件 (HostComponent，如 <div>) 或宿主文本节点 (HostText)
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			insertChildToContainer(finishedWork.stateNode, hostParent, before);
		} else {
			appendChildToContainer(hostParent, finishedWork.stateNode);
		}
		return;
	}

	// 4. 如果 finishedWork 不是直接的宿主节点 (例如，它可能是一个函数组件 FunctionComponent)，
	//    那么它本身不对应一个 DOM 元素。我们需要找到它渲染出来的实际 DOM 子孙节点。
	//    获取 finishedWork 的第一个子 Fiber 节点。
	const child = finishedWork.child;

	// 5. 如果 finishedWork 有子节点 (child !== null)
	if (child !== null) {
		// 6. 递归调用 appendPlacementNodeIntoContainer，
		//    尝试将第一个子节点 (child) 放置到同一个 hostParent 中。
		//    这是因为如果父节点 (finishedWork) 是一个组件，那么它的子节点才是实际要渲染的内容。
		insertOrAppendPlacementNodeIntoContainer(child, hostParent);

		// 7. 处理第一个子节点之后，还需要处理它的所有兄弟节点。
		//    获取第一个子节点的兄弟节点。
		let sibling = child.sibling;

		// 8. 循环遍历所有兄弟节点
		while (sibling !== null) {
			// 9. 对每个兄弟节点，同样递归调用 appendPlacementNodeIntoContainer，
			//    将它们也放置到同一个 hostParent 中。
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
			// 10. 移动到下一个兄弟节点
			sibling = sibling.sibling;
		}
	}
	// 11. 如果 finishedWork 没有子节点 (例如一个没有返回任何内容的组件)，则此函数不执行任何操作。
}
