import { Dispatch } from 'react/src/currentDispatcher';
import { Dispatcher } from 'react/src/currentDispatcher';
import internals from 'shared/internals';
import { Action } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	UpdateQueue
} from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';

let currentlyRenderingFiber: FiberNode | null = null;
// 指向链表中当前正在处理的hook（fiberNode 中的 memoizedState 指向一个链表，链表的元素是Hooks（useState、useEffect...））
let workInProgressHook: Hook | null = null;

const { currentDispatcher } = internals;

/**
 * @property {any} memoizedState - 此hook的自身状态
 * @property {Hook} next - 指向下一个hook
 */
interface Hook {
	// 此处的 memoizedState 不同于 fiberNode 中的 memoizedState
	// fiberNode 中的 memoizedState 指向一个链表，链表的元素是Hooks（useState、useEffect...）
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

/**
 * @description 执行一个函数式组件 (Function Component) 并获取它渲染出来的内容
 * @param wip 是 FunctionComponent 类型的fibernode
 */
export function renderWithHooks(wip: FiberNode) {
	// 赋值操作

	// 目的：hook要知道自身数据保存在哪里
	// 作用：记录当前正在render的FC对应的fiberNode，在fiberNode中保存hook数据
	currentlyRenderingFiber = wip;
	// 重置
	wip.memoizedState = null;

	const current = wip.alternate;

	if (current !== null) {
		// update
	} else {
		// mount
		currentDispatcher.current = HooksDispatcherOnMount;
	}
	// wip.type: 这个 type 属性对于函数式组件来说，就是那个组件函数本身
	const Component = wip.type;
	const props = wip.pendingProps;
	const children = Component(props);

	// 重置操作
	currentlyRenderingFiber = null;
	return children;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};

function mountState<State>(
	initialState: (() => State) | State // 初始状态值，或者一个计算初始状态的函数
): [State, Dispatch<State>] {
	// 返回我们熟悉的 [state, setState] 这对组合

	// 1. 获取或创建专属于这次 useState 调用的 Hook 对象。
	//    `mountWorkInProgresHook` 函数会确保我们为这个组件的 Hook 链表
	//    准备好一个“坑位”（一个 Hook 对象）。这个“坑位”会用来存放
	//    *当前这次* useState 调用所需的状态和更新队列。
	const hook = mountWorkInProgresHook();

	// 2. 计算初始的 memoizedState (记忆化状态)。
	let memoizedState;
	if (initialState instanceof Function) {
		// 如果 `initialState` 是一个函数 (比如 useState(() => computeExpensiveValue()))，
		// 就调用它来获取真正的初始状态。这是为了实现“惰性初始化”。
		memoizedState = initialState();
	} else {
		// 否则，`initialState` 就是直接给定的初始值。
		memoizedState = initialState;
	}

	// 3. 为这个状态创建一个更新队列。
	//    每一个由 useState 管理的状态都需要有它自己的队列来存放待处理的更新。
	const queue = createUpdateQueue<State>();

	// 4. 把更新队列和初始状态存放到 Hook 对象上。
	//    现在，我们为这次 useState 准备的 `hook`“坑位”里就有了必要的信息。
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;

	// 5. 创建 dispatch 函数 (也就是我们常说的 `setState` 函数)。
	//    `dispatchSetState` 是一个通用的、处理状态更新的函数。
	//    我们使用 `bind` 方法来创建一个新的函数，这个新函数在调用 `dispatchSetState` 时，
	//    其前几个参数（也就是 `fiber` 和 `updateQueue`）已经被预先填好了。
	//    `currentlyRenderingFiber` 是一个模块级别的变量，指向当前正在渲染的组件的 FiberNode。
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);

	// 6. 将 dispatch 函数关联到它的队列上。
	//    这样做可以让更新队列本身在需要时能够引用到它的派发函数。
	//    这对于更高级的队列处理或者开发工具来说可能有用。
	queue.dispatch = dispatch;

	// 7. 返回 [state, setState] 这对组合。
	//    这就是 `useState` 的使用者最终拿到的东西。
	return [memoizedState, dispatch];
}

/**
 * @description
 * 1. 打包更新请求
 * 2. 把更新请求放入队列
 * 3. 触发重新渲染
 */
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	// 1. 创建一个标准的 'Update' 对象。
	//    它会把你的 'action'（新的状态值或更新函数）包装成一个
	//    更新队列系统能理解的标准化 'Update' 结构。
	const update = createUpdate(action);

	// 2. 把这个 'Update' 对象加入到 Hook 的更新队列中。
	enqueueUpdate(updateQueue, update);

	// 3. 为这个组件安排一次重新渲染。
	//    'scheduleUpdateOnFiber' 会告诉协调器（reconciler），这个 'fiber'（组件）
	//    有一个待处理的更新，需要在未来的工作循环中被重新处理（重新渲染）。
	scheduleUpdateOnFiber(fiber);
}

/**
 * @description
 * - 在函数组件的初始挂载阶段，创建并管理一个与该组件的 FiberNode 相关联的 Hook 对象链表。
 * - 这个链表中的每一个 Hook 对象都对应组件内部的一次 Hook 调用（比如 useState），并且保留了 Hook 调用的顺序。
 * - 这个链表的起点存储在 FiberNode.memoizedState 中
 */
function mountWorkInProgresHook(): Hook {
	// 1. 创建一个新的、空的 "Hook" 对象。
	//    这个对象会用来存放某一个 Hook 调用（比如一次 useState 调用）的状态和更新队列。
	const hook: Hook = {
		memoizedState: null, // 实际的状态值会在 mountState 函数里被填进去
		updateQueue: null, // 这个状态对应的更新队列也会在 mountState 函数里创建
		next: null // 指向这个组件里下一个 Hook 的指针（如果有的话）
	};

	// 2. 检查这是否是当前组件正在处理的第一个 Hook。
	//    如果 `workInProgressHook` 是 null，就意味着我们还没为这个组件处理过任何 Hook。
	if (workInProgressHook === null) {
		// 这是这个函数组件里的第一个 Hook (比如第一次调用 useState)。

		// 2a. 安全检查：确保我们确实是在一个函数组件的渲染阶段内部。
		//     `currentlyRenderingFiber` 应该已经被 `renderWithHooks` 函数设置成了
		//     我们当前正在渲染的组件的 FiberNode。
		if (currentlyRenderingFiber === null) {
			// 如果不是，那就有问题了 —— Hook 只能在函数组件内部调用。
			throw new Error('请在函数组件内调用hook');
		} else {
			// 2b. 这是第一个 Hook，所以：
			//    - `workInProgressHook` (我们用来追踪上一个已处理 Hook 的变量) 现在指向这个新的 `hook`。
			workInProgressHook = hook;
			//    - 组件的 FiberNode (`currentlyRenderingFiber`) 的 `memoizedState` 属性
			//      被设置指向这个 `hook`。这样，这个 Hook 链表中的 *第一个* Hook
			//      就可以从 FiberNode 访问到了。
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// 这不是这个函数组件里的第一个 Hook (比如是第二次、第三次等等调用 useState)。
		// 我们需要把这个新的 `hook` 连接到现有 Hook 链条的末尾。

		// 3a. *前一个* Hook (`workInProgressHook` 当前指向的是前一个) 的 `next` 指针
		//     被设置指向我们新创建的这个 `hook`。这就把新的 hook 加入到了链表中。
		workInProgressHook.next = hook;
		// 3b. 然后，更新 `workInProgressHook`，让它指向我们新创建的这个 `hook`，
		//     使其成为下一次迭代时的“上一个已处理 Hook”。
		workInProgressHook = hook;
	}

	// 4. 返回新创建的（并且现在已经连接好的）`hook` 对象。
	//    调用它的函数 (比如 `mountState`) 接下来会把实际的状态值和更新队列放进这个 `hook` 对象里。
	return workInProgressHook;
}
