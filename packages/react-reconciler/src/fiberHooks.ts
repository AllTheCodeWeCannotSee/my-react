import { Dispatch } from 'react/src/currentDispatcher';
import { Dispatcher } from 'react/src/currentDispatcher';
import internals from 'shared/internals';
import { Action } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	UpdateQueue
} from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';

let currentlyRenderingFiber: FiberNode | null = null;

// 指向链表中当前正在处理的hook（fiberNode 中的 memoizedState 指向一个链表，链表的元素是Hooks（useState、useEffect...））
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

/**
 * @property {any} memoizedState - 存储了 Hook 的核心数据（如状态值）
 * @property {unknown} updateQueue - 与该 Hook 相关的更新队列
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
 * @return 返回函数组件执行后产生的子 React 元素 (children)
 */
export function renderWithHooks(wip: FiberNode, lane: Lane) {
	// 赋值操作

	// 目的：hook要知道自身数据保存在哪里
	// 作用：记录当前正在render的FC对应的fiberNode，在fiberNode中保存hook数据
	currentlyRenderingFiber = wip;
	// 重置 hooks链表
	wip.memoizedState = null;
	renderLane = lane;

	const current = wip.alternate;

	if (current !== null) {
		// update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		// mount
		currentDispatcher.current = HooksDispatcherOnMount;
	}
	// wip.type: 这个 type 属性对于函数式组件来说，就是那个组件函数本身
	const Component = wip.type;
	const props = wip.pendingProps;
	// FC render
	const children = Component(props);

	// 重置操作
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	renderLane = NoLane;
	return children;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState
};

/**
 * @description
 * * 联系：当一个已经挂载的组件因为状态变化或其他原因需要重新渲染时，它内部的 useState 调用就会走到这个
 * * 流程：
 * 	* 找到当前这个 useState 调用在上一次渲染时对应的状态数据。
 * 	* 检查是否有新的状态更新请求（即，是否调用了 setState）。
 * 	* 如果有，则计算出新的状态。
 * 	* 返回最新的状态值和对应的 setState 函数。
 * @returns
 */
function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgresHook();

	// 计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;
	queue.shared.pending = null;

	if (pending !== null) {
		const { memoizedState } = processUpdateQueue(
			hook.memoizedState,
			pending,
			renderLane
		);
		hook.memoizedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

/**
 * @description
 * * 作用：
 * 	* 找到旧 Hook
 * 	* 创建新 Hook
 * 	* 维护 Hook 链表
 * 	* 错误检测
 * * 什么时候触发：
 * 	* 交互阶段 onClick
 * 	* render阶段 （TODO）
 * @returns
 */
function updateWorkInProgresHook(): Hook {
	// TODO render阶段触发的更新 (这个注释可能指未来需要处理在渲染阶段直接触发更新的复杂情况)
	let nextCurrentHook: Hook | null; // 用来存储从上一次渲染的 Hook 链表中找到的、与当前 Hook 调用对应的那个 Hook 对象

	// 1. 确定当前应该处理哪个 "current" Hook (来自上一次渲染的 Hook)
	if (currentHook === null) {
		// 这是这个函数组件在本次 update 过程中的第一个 Hook 调用
		// currentHook 是一个模块级变量，用于在遍历一个组件的多个 Hook 时，追踪上一次渲染中对应的 Hook 链表的当前位置。
		// 如果它是 null，说明我们正要处理这个组件的第一个 Hook。

		const current = currentlyRenderingFiber?.alternate; // 获取上一次渲染完成的 Fiber 节点 (current tree)

		if (current !== null) {
			// 如果存在上一次渲染的 Fiber 节点 (即不是首次挂载后的第一次更新，而是后续的更新)
			nextCurrentHook = current?.memoizedState; // 函数组件的 Fiber 节点的 `memoizedState` 属性指向其 Hook 链表的头节点。
			// 所以，这里获取的是上一次渲染时该组件的第一个 Hook 对象。
		} else {
			// mount (理论上这个分支不应该在 updateWorkInProgresHook 中被走到)
			// 因为 `renderWithHooks` 函数在 `current === null` (mount 阶段) 时，
			// 会将 `currentDispatcher.current` 设置为 `HooksDispatcherOnMount`，
			// 从而调用 `mountState` 和 `mountWorkInProgresHook`。
			// 如果 `current !== null` (update 阶段)，才会设置为 `HooksDispatcherOnUpdate`，
			// 进而调用 `updateState` 和 `updateWorkInProgresHook`。
			// 所以，如果在这里 `current` 为 `null`，可能表示逻辑上的一个问题或未覆盖的边界情况。
			// 但基于 `renderWithHooks` 的逻辑，`current` 在这里应该总是不为 `null`。
			nextCurrentHook = null;
		}
	} else {
		// 这不是本次 update 过程中的第一个 Hook 调用，而是后续的 Hook 调用。
		// `currentHook` 此时指向的是上一次渲染中、与上一个已处理的 Hook 相对应的那个 Hook 对象。
		nextCurrentHook = currentHook.next; // 移动到上一次渲染的 Hook 链表中的下一个 Hook 对象。
	}

	// 2. 检查 Hook 调用顺序是否一致
	if (nextCurrentHook === null) {
		// 如果 `nextCurrentHook` 为 `null`，意味着：
		// - 情况1 (mount/update u1 u2 u3 / update u1 u2 u3 u4):
		//   上一次渲染有 N 个 Hook，但本次渲染尝试获取第 N+1 个 Hook，说明本次渲染比上次多调用了 Hook。
		//   这是不允许的，违反了 Hooks 的规则 (Hooks must be called in the same order each time a component renders)。
		throw new Error(
			`组件${currentlyRenderingFiber?.type}本次执行时的Hook比上次执行时多`
		);
	}

	// 3. 更新 currentHook 指针，并创建新的 work-in-progress Hook
	currentHook = nextCurrentHook as Hook; // 将 `currentHook` 指向从旧链表中找到的当前 Hook。
	// 现在 `currentHook` 是新 Hook 的数据来源。

	const newHook: Hook = {
		// 创建一个新的 Hook 对象，用于本次渲染 (work-in-progress tree)
		memoizedState: currentHook.memoizedState, // 复制上一次渲染的状态值
		updateQueue: currentHook.updateQueue, // 复制上一次渲染的更新队列引用
		next: null // next 指针暂时为 null，如果后面还有 Hook，会被连接上
	};

	// 4. 将新的 Hook 对象链接到 work-in-progress Fiber 的 Hook 链表中
	// `workInProgressHook` 是一个模块级变量，用于在构建本次渲染的 Hook 链表时，追踪链表的尾部。
	if (workInProgressHook === null) {
		// 这是为当前 work-in-progress Fiber 创建的第一个 Hook 对象
		if (currentlyRenderingFiber === null) {
			// 安全检查：Hooks 必须在函数组件内部调用。
			// `currentlyRenderingFiber` 应该由 `renderWithHooks` 设置。
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook; // `workInProgressHook` 指向这个新创建的 Hook (它现在是链表尾部)
			currentlyRenderingFiber.memoizedState = workInProgressHook; // 将 work-in-progress Fiber 的 `memoizedState` 指向这个新 Hook (它也是链表头部)
		}
	} else {
		// 这不是第一个 Hook，将新 Hook 连接到链表的末尾
		workInProgressHook.next = newHook; // 将前一个 work-in-progress Hook 的 next 指向这个新 Hook
		workInProgressHook = newHook; // 更新 `workInProgressHook`，使其指向新的链表尾部
	}
	return workInProgressHook; // 返回新创建并链接好的 Hook 对象
}

/**
 * @description useState Hook 在组件首次挂载时的实现。
 * @param initialState 初始状态值，或者一个计算初始状态的函数。
 * @returns 数组 [state, setState]
 */
function mountState<State>(
	initialState: (() => State) | State // 初始状态值，或者一个计算初始状态的函数
): [State, Dispatch<State>] {
	// 1. 获取或创建专属于这次 useState 调用的 Hook 对象。
	//    `mountWorkInProgresHook` 函数会确保我们为这个组件的 Hook 链表
	//    准备好一个“坑位”（一个 Hook 对象）。这个“坑位”会用来存放
	//    *当前这次* useState 调用所需的状态和更新队列。
	const hook = mountWorkInProgresHook();

	let memoizedState;
	if (initialState instanceof Function) {
		// 如果 `initialState` 是一个函数 (比如 useState(() => computeExpensiveValue()))，
		// 就调用它来获取真正的初始状态。这是为了实现“惰性初始化”。
		memoizedState = initialState();
	} else {
		// 否则，`initialState` 就是直接给定的初始值。
		memoizedState = initialState;
	}

	const queue = createUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;

	// 创建 dispatch 函数 (也就是我们常说的 `setState` 函数)。
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);

	// 将 dispatch 函数关联到它的队列上。
	queue.dispatch = dispatch;

	return [memoizedState, dispatch];
}

/**
 * @description 当你调用由 useState 返回的那个用于更新状态的函数时，最终就会执行到这个 dispatchSetState。
 * 1. 打包更新请求
 * 2. 把更新请求放入队列
 * 3. 触发重新渲染
 */
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane();
	const update = createUpdate(action, lane);

	// 2. 把这个 'Update' 对象加入到 Hook 的更新队列中。
	enqueueUpdate(updateQueue, update);

	// 3. 为这个组件安排一次重新渲染。
	scheduleUpdateOnFiber(fiber, lane);
}

/**
 * @description 在函数组件的初始挂载阶段，创建并管理一个与该组件的 FiberNode 相关联的 Hook 对象链表。
 * @returns 返回新创建并链接好的 Hook 对象（空的）。
 */
function mountWorkInProgresHook(): Hook {
	// 这个对象会用来存放某一个 Hook 调用（比如一次 useState 调用）的状态和更新队列。
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
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}

	return workInProgressHook;
}
