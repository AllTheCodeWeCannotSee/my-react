import { Dispatch } from 'react/src/currentDispatcher';
import { Dispatcher } from 'react/src/currentDispatcher';
import currentBatchConfig from 'react/src/currentBatchConfig';
import internals from 'shared/internals';
import { Action, ReactContext, Thenable, Usable } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import {
	Lane,
	NoLane,
	NoLanes,
	mergeLanes,
	removeLanes,
	requestUpdateLane
} from './fiberLanes';
import {
	basicStateReducer,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	Update,
	UpdateQueue
} from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';
import { trackUsedThenable } from './thenable';
import { REACT_CONTEXT_TYPE } from 'shared/ReactSymbols';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';
import { markWipReceivedUpdate } from './beginWork';
import { readContext as readContextOrigin } from './fiberContext';

let currentlyRenderingFiber: FiberNode | null = null;

/**
 * @param workInProgressHook 指向链表中当前正在处理的 Hook, 指向链表的尾部 (Fiber.memoizedState = workInProgressHook)
 */
let workInProgressHook: Hook | null = null;

/**
 * @param currentHook 指向上一次渲染的 Hook 链表中，与当前正在处理的这个 Hook 调用相对应的那个 Hook 对象
 */
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

function readContext<Value>(context: ReactContext<Value>): Value {
	const consumer = currentlyRenderingFiber as FiberNode;
	return readContextOrigin(consumer, context);
}

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
	baseState: any;
	baseQueue: Update<any> | null;
}

export interface Effect {
	tag: Flags;
	create: EffectCallback | void;
	destroy: EffectCallback | void;
	deps: HookDeps;
	next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	// 指向effect环状链表中，最后一个
	lastEffect: Effect | null;
	lastRenderedState: State;
}

type EffectCallback = () => void;
export type HookDeps = any[] | null;

export function renderWithHooks(
	wip: FiberNode,
	Component: FiberNode['type'],
	lane: Lane
) {
	// 赋值操作

	// 目的：hook要知道自身数据保存在哪里
	// 作用：记录当前正在render的FC对应的fiberNode，在fiberNode中保存hook数据
	currentlyRenderingFiber = wip;
	// 重置 hooks链表
	wip.memoizedState = null;

	// 重置 effect链表
	wip.updateQueue = null;
	renderLane = lane;

	const current = wip.alternate;

	if (current !== null) {
		// update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		// mount
		currentDispatcher.current = HooksDispatcherOnMount;
	}

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
	useState: mountState,
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext,
	use,
	useMemo: mountMemo,
	useCallback: mountCallback
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext,
	use,
	useMemo: updateMemo,
	useCallback: updateCallback
};

/**
 * @function mountRef
 * @description `useRef` Hook 在组件首次挂载时的实现。
 *              它会创建一个新的 Hook 对象，并初始化一个 ref 对象
 *              （形如 `{ current: initialValue }`）。
 *              这个 ref 对象会被存储在当前 Hook 对象的 `memoizedState` 中，
 *              并在后续的渲染中保持引用稳定。
 *
 * @template T - ref 对象中 `current` 属性值的类型。
 * @param {T} initialValue - ref 对象 `current` 属性的初始值。
 * @returns {{ current: T }} 返回创建的 ref 对象。
 *                           这个对象的 `current` 属性可以被用户读取和修改，
 *                           并且在组件的整个生命周期内保持同一个引用。
 */
function mountRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgressHook();
	const ref = { current: initialValue };
	hook.memoizedState = ref;
	return ref;
}

/**
 * @function updateRef
 * @description `useRef` Hook 在组件更新阶段的实现。
 *              它会从上一次渲染的 Hook 状态中获取之前创建的 ref 对象
 *              （存储在 `memoizedState` 中）。
 *              由于 ref 对象的引用在组件的整个生命周期内都应该是稳定的，
 *              此函数仅返回上一次渲染时创建的同一个 ref 对象。
 *
 * @template T - ref 对象中 `current` 属性值的类型。
 * @param {T} initialValue - (未使用) 在更新阶段，`useRef` 的参数 `initialValue` 会被忽略。
 *                            ref 的值仅在首次挂载时被初始化。
 * @returns {{ current: T }} 返回上一次渲染时创建的 ref 对象。
 */
function updateRef<T>(initialValue: T): { current: T } {
	const hook = updateWorkInProgressHook();
	return hook.memoizedState;
}

/**
 * @description useEffect Hook 在组件首次挂载时的实现
 * @param create 用户传入的 useEffect 的第一个参数，即副作用的创建函数
 * @param deps 用户传入的 useEffect 的第二个参数，即依赖项数组 (可选)
 */
function mountEffect(create: EffectCallback | void, deps: HookDeps | void) {
	// 获取这次 useEffect 调用的 Hook 对象
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;

	// 在当前正在渲染的 FiberNode 上打上 PassiveEffect
	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;

	// 创建并存储 Effect 对象
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}

/**
 * @function updateEffect
 * @description `useEffect` Hook 在组件更新阶段的实现。
 *              它会比较新的依赖项与上一次渲染时的依赖项：
 *              - 如果依赖项没有变化，它仍然会创建一个新的 Effect 对象来保留上一次的销毁函数和依赖项信息，
 *                但这个 Effect 对象不会被打上 `HookHasEffect` 标记，因此其创建函数不会在本次提交中执行。
 *              - 如果依赖项发生了变化（或者没有提供依赖项数组，意味着每次渲染都执行），
 *                当前组件的 FiberNode 会被打上 `PassiveEffect` 标记，
 *                并且会创建一个新的 Effect 对象，该对象带有 `HookHasEffect` 标记，
 *                其创建函数将在本次提交后执行。新的 Effect 对象会保留上一次的销毁函数，
 *                以便在执行新的创建函数之前调用。
 *
 * @param {EffectCallback | void} create - 用户传入的 `useEffect` 的第一个参数，即副作用的创建函数。
 * @param {EffectDeps | void} deps - 用户传入的 `useEffect` 的第二个参数，即依赖项数组 (可选)。
 */
function updateEffect(create: EffectCallback | void, deps: HookDeps | void) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void;

	if (currentHook !== null) {
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;

		if (nextDeps !== null) {
			// 浅比较依赖
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		// 浅比较 不相等
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

/**
 * @function areHookInputsEqual
 * @description 浅比较两个依赖项数组 (`EffectDeps`) 是否相等。
 * @param {EffectDeps} nextDeps - 新的依赖项数组。`EffectDeps` 类型通常是 `any[] | null`。
 * @param {EffectDeps} prevDeps - 上一次渲染时的依赖项数组。
 * @returns {boolean} 如果两个依赖项数组被认为是相等的，则返回 `true`；否则返回 `false`。
 */
function areHookInputsEqual(nextDeps: HookDeps, prevDeps: HookDeps) {
	if (prevDeps === null || nextDeps === null) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}

/**
 * @description 创建一个新的 Effect 对象，并将其添加到当前 FiberNode 的 Effect 链表的末尾。
 * @param hookFlags Effect 的标记 (例如 Passive | HookHasEffect)。
 * @param create 副作用的创建函数。
 * @param destroy 副作用的销毁函数 (在挂载时通常是 undefined)。
 * @param deps 依赖项数组。
 * @returns 返回新创建的 Effect 对象。
 */

function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: HookDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	};
	const fiber = currentlyRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;

	if (updateQueue === null) {
		// // 如果当前 FiberNode 还没有 updateQueue
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		// 如果 updateQueue 已经存在
		// 插入effect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}
	return effect;
}

function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

/**
 * @function updateState
 * @description `useState` Hook 在组件更新阶段的实现。
 *              当一个已挂载的组件因状态变化或其他原因重新渲染时，其内部的 `useState` 调用会执行此函数。
 *              主要流程：
 *              1. **获取当前 Hook**: 调用 `updateWorkInProgressHook` 来获取或创建与当前 `useState` 调用对应的
 *                 work-in-progress Hook 对象，并从 `currentHook` (上一次渲染的 Hook) 继承状态和队列信息。
 *              2. **处理更新队列**:
 *                 - 获取当前 Hook 的 `updateQueue`、`baseState` (上一次计算完成的基础状态)。
 *                 - 检查 `updateQueue.shared.pending` (由 `dispatchSetState` 添加的新更新)
 *                   以及 `currentHook.baseQueue` (上一次渲染中被跳过的更新)。
 *                 - 如果存在新的 `pending` 更新，将其与 `baseQueue` 合并，形成一个完整的待处理更新链表。
 *                   这个合并后的链表会存储在 `currentHook.baseQueue` 中，以备后续可能的 bailout 或重用。
 *              3. **计算新状态**: 如果存在待处理的更新链表 (`baseQueue`)：
 *                 - 调用 `processUpdateQueue`，传入 `baseState`、`baseQueue` 和当前的 `renderLane`。
 *                 - `processUpdateQueue` 会遍历更新链表，只应用那些优先级与 `renderLane` 匹配的更新，
 *                   计算出新的 `memoizedState`。
 *                 - 任何因优先级不足而被跳过的更新，会被 `processUpdateQueue` 重新组织成一个新的 `baseQueue`，
 *                   并更新 `baseState` (第一个被跳过的更新前的状态)。
 *                 - 如果计算出的 `memoizedState` 与上一次的 `memoizedState` (通过 `Object.is` 比较) 不同，
 *                   则调用 `markWipReceivedUpdate` 标记当前 Fiber 节点接收到了更新。
 *              4. **更新 Hook 状态**: 将计算得到的 `memoizedState`、`baseState` 和 `baseQueue`
 *                 存储回当前的 work-in-progress Hook 对象。
 *              5. **记录渲染状态**: 将最终的 `memoizedState` 存储到 `updateQueue.lastRenderedState`，
 *                 供下一次 eager state 优化或 `dispatchSetState` 使用。
 * @template State - 状态的类型。
 * @returns {[State, Dispatch<State>]} 返回一个包含两个元素的数组：
 *          - `memoizedState` (State): 当前 Hook 计算得出的最新状态值。
 *          - `dispatch` (Dispatch<State>): 与此状态关联的 dispatch 函数 (即 `setState`)。
 */
function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();

	// 计算新state的逻辑
	const queue = hook.updateQueue as FCUpdateQueue<State>;

	const baseState = hook.baseState;
	const pending = queue.shared.pending;
	queue.shared.pending = null;

	const current = currentHook as Hook;
	let baseQueue = current.baseQueue;

	if (pending !== null) {
		// pending baseQueue update保存在current中
		if (baseQueue !== null) {
			// baseQueue b2 -> b0 -> b1 -> b2
			// pendingQueue p2 -> p0 -> p1 -> p2
			// b0
			const baseFirst = baseQueue.next;
			// p0
			const pendingFirst = pending.next;
			// b2 -> p0
			baseQueue.next = pendingFirst;
			// p2 -> b0
			pending.next = baseFirst;
			// p2 -> b0 -> b1 -> b2 -> p0 -> p1 -> p2
		}
		baseQueue = pending;
		// 保存在current中
		current.baseQueue = pending;
		queue.shared.pending = null;
	}
	if (baseQueue !== null) {
		const prevState = hook.memoizedState;
		const {
			memoizedState,
			baseQueue: newBaseQueue,
			baseState: newBaseState
		} = processUpdateQueue(baseState, baseQueue, renderLane, (update) => {
			const skippedLane = update.lane;
			const fiber = currentlyRenderingFiber as FiberNode;
			// NoLanes
			fiber.lanes = mergeLanes(fiber.lanes, skippedLane);
		});

		// NaN === NaN // false
		// Object.is true

		// +0 === -0 // true
		// Object.is false
		if (!Object.is(prevState, memoizedState)) {
			markWipReceivedUpdate();
		}
		hook.memoizedState = memoizedState;
		hook.baseState = newBaseState;
		hook.baseQueue = newBaseQueue;

		queue.lastRenderedState = memoizedState;
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
function updateWorkInProgressHook(): Hook {
	// TODO render阶段触发的更新 (这个注释可能指未来需要处理在渲染阶段直接触发更新的复杂情况)
	let nextCurrentHook: Hook | null; // 用来存储从上一次渲染的 Hook 链表中找到的、与当前 Hook 调用对应的那个 Hook 对象

	// 1. 确定当前应该处理哪个 "current" Hook (来自上一次渲染的 Hook)
	if (currentHook === null) {
		// 这是这个函数组件在本次 update 过程中的第一个 Hook 调用
		// currentHook 是一个模块级变量，用于在遍历一个组件的多个 Hook 时，追踪上一次渲染中对应的 Hook 链表的当前位置。
		// 如果它是 null，说明我们正要处理这个组件的第一个 Hook。

		const current = (currentlyRenderingFiber as FiberNode).alternate; // 获取上一次渲染完成的 Fiber 节点 (current tree)

		if (current !== null) {
			// 如果存在上一次渲染的 Fiber 节点 (即不是首次挂载后的第一次更新，而是后续的更新)
			nextCurrentHook = current.memoizedState; // 函数组件的 Fiber 节点的 `memoizedState` 属性指向其 Hook 链表的头节点。
			// 所以，这里获取的是上一次渲染时该组件的第一个 Hook 对象。
		} else {
			// mount (理论上这个分支不应该在 updateWorkInProgressHook 中被走到)
			// 因为 `renderWithHooks` 函数在 `current === null` (mount 阶段) 时，
			// 会将 `currentDispatcher.current` 设置为 `HooksDispatcherOnMount`，
			// 从而调用 `mountState` 和 `mountWorkInProgressHook`。
			// 如果 `current !== null` (update 阶段)，才会设置为 `HooksDispatcherOnUpdate`，
			// 进而调用 `updateState` 和 `updateWorkInProgressHook`。
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
			`组件 ${currentlyRenderingFiber?.type.name} 本次执行时的Hook比上次执行时多`
		);
	}

	// 3. 更新 currentHook 指针，并创建新的 work-in-progress Hook
	currentHook = nextCurrentHook as Hook; // 将 `currentHook` 指向从旧链表中找到的当前 Hook。
	// 现在 `currentHook` 是新 Hook 的数据来源。

	const newHook: Hook = {
		// 创建一个新的 Hook 对象，用于本次渲染 (work-in-progress tree)
		memoizedState: currentHook.memoizedState, // 复制上一次渲染的状态值
		updateQueue: currentHook.updateQueue, // 复制上一次渲染的更新队列引用
		next: null, // next 指针暂时为 null，如果后面还有 Hook，会被连接上
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
	};

	// 4. 将新的 Hook 对象链接到 work-in-progress Fiber 的 Hook 链表中
	if (workInProgressHook === null) {
		if (currentlyRenderingFiber === null) {
			// 安全检查：Hooks 必须在函数组件内部调用。
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook; // `workInProgressHook` 指向这个新创建的 Hook (它现在是链表尾部)

			// 将 work-in-progress Fiber 的 `memoizedState` 指向这个新 Hook (它也是链表头部)
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// 这不是第一个 Hook，将新 Hook 连接到链表的末尾
		workInProgressHook.next = newHook; // 将前一个 work-in-progress Hook 的 next 指向这个新 Hook
		workInProgressHook = newHook; // 更新 `workInProgressHook`，使其指向新的链表尾部
	}
	return workInProgressHook; // 返回新创建并链接好的 Hook 对象
}

/**
 * @function mountState
 * @description `useState` Hook 在组件首次挂载 (mount) 阶段的实现。
 *              它负责：
 *              1. **创建 Hook 对象**: 调用 `mountWorkInProgressHook` 来为当前的 `useState` 调用
 *                 创建一个新的 Hook 对象，并将其链接到当前 Fiber 节点的 Hook 链表中。
 *              2. **初始化状态**:
 *                 - 如果 `initialState` 是一个函数，则调用该函数以获取初始状态值（惰性初始化）。
 *                 - 否则，直接使用 `initialState` 作为初始状态值。
 *              3. **创建更新队列**: 为此 Hook 创建一个新的 `FCUpdateQueue` (函数组件更新队列)。
 *              4. **存储状态和队列**: 将计算出的初始状态 (`memoizedState`) 和创建的更新队列
 *                 存储到新创建的 Hook 对象中。`baseState` 也被初始化为 `memoizedState`。
 *              5. **创建 Dispatch 函数**: 创建一个与此状态和队列绑定的 `dispatchSetState` 函数
 *                 (即用户调用的 `setState` 函数)。
 *              6. **关联 Dispatch**: 将创建的 `dispatch` 函数存储到更新队列的 `dispatch` 属性上。
 *              7. **记录渲染状态**: 将初始状态存储到更新队列的 `lastRenderedState` 属性，
 *                 供后续的 eager state 优化使用。
 * @template State - 状态的类型。
 * @param {(() => State) | State} initialState - 初始状态值，或者一个返回初始状态值的函数。
 * @returns {[State, Dispatch<State>]} 返回一个包含两个元素的数组：初始状态值和用于更新该状态的 dispatch 函数。
 */
function mountState<State>(
	initialState: (() => State) | State // 初始状态值，或者一个计算初始状态的函数
): [State, Dispatch<State>] {
	// 1. 获取或创建专属于这次 useState 调用的 Hook 对象。
	//    `mountWorkInProgressHook` 函数会确保我们为这个组件的 Hook 链表
	//    准备好一个“坑位”（一个 Hook 对象）。这个“坑位”会用来存放
	//    *当前这次* useState 调用所需的状态和更新队列。
	const hook = mountWorkInProgressHook();

	let memoizedState;
	if (initialState instanceof Function) {
		// 如果 `initialState` 是一个函数 (比如 useState(() => computeExpensiveValue()))，
		// 就调用它来获取真正的初始状态。这是为了实现“惰性初始化”。
		memoizedState = initialState();
	} else {
		// 否则，`initialState` 就是直接给定的初始值。
		memoizedState = initialState;
	}

	const queue = createFCUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;
	hook.baseState = memoizedState;

	// 创建 dispatch 函数 (也就是我们常说的 `setState` 函数)。
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);

	// 将 dispatch 函数关联到它的队列上。
	queue.dispatch = dispatch;

	queue.lastRenderedState = memoizedState;

	return [memoizedState, dispatch];
}

/**
 * @function mountTransition
 * @description `useTransition` Hook 在组件首次挂载时的实现。
 *              它内部会调用 `mountState` 来创建一个布尔类型的状态 `isPending` (初始值为 `false`)
 *              以及一个用于更新该状态的函数 `setPending`。
 *              然后，它会创建一个 `startTransition` 函数，该函数在被调用时会：
 *              1. 将 `isPending` 状态设置为 `true`。
 *              2. 设置全局的 `currentBatchConfig.transition`，标记当前处于一个 transition 过程中。
 *              3. 执行用户传入的回调函数。
 *              4. 将 `isPending` 状态设置为 `false`。
 *              5. 恢复全局的 `currentBatchConfig.transition`。
 *              这个 `startTransition` 函数会被存储在当前 Hook 对象的 `memoizedState` 中。
 *
 * @returns {[boolean, (callback: () => void) => void]} 返回一个包含两个元素的数组：
 *          - `isPending` (boolean): 一个布尔值，指示 transition 是否正在进行中。
 *          - `startTransition` (function): 一个函数，用于启动一个 transition。
 *                                        它接收一个回调函数作为参数，这个回调函数中通常包含
 *                                        会导致状态更新的操作。
 */
function mountTransition(): [boolean, (callback: () => void) => void] {
	const [isPending, setPending] = mountState(false);
	const hook = mountWorkInProgressHook();
	const start = startTransition.bind(null, setPending);
	hook.memoizedState = start;
	return [isPending, start];
}

function updateTransition(): [boolean, (callback: () => void) => void] {
	const [isPending] = updateState();
	const hook = updateWorkInProgressHook();
	const start = hook.memoizedState;
	return [isPending as boolean, start];
}

/**
 * @function startTransition
 * @description 启动一个 transition 过程。
 *              这个函数通常由 `useTransition` Hook 返回，并由用户调用。
 *              它会：
 *              1. 调用 `setPending(true)` 来将 `isPending` 状态设置为 `true`，
 *                 表明一个 transition 已经开始。
 *              2. 记录并设置全局的 `currentBatchConfig.transition` 为一个非 `null` 值（当前实现为 1），
 *                 这使得在 `callback` 内部触发的状态更新（通过 `requestUpdateLane`）
 *                 能够获取到 `TransitionLane` 优先级。
 *              3. 同步执行用户传入的 `callback` 函数。这个回调函数中通常包含
 *                 那些希望在 transition 过程中执行的状态更新操作（例如，调用 `setState`）。
 *              4. 调用 `setPending(false)` 来将 `isPending` 状态设置为 `false`，
 *                 表明 transition 已经（在同步执行完回调后）初步完成。
 *                 注意：这并不意味着由回调触发的低优先级更新已经渲染完毕。
 *              5. 恢复全局的 `currentBatchConfig.transition`到之前的值。
 *
 * @param {Dispatch<boolean>} setPending - 一个用于更新 `isPending` 状态的 dispatch 函数，
 *                                         由 `useTransition` 内部的 `useState` 提供。
 * @param {() => void} callback - 用户提供的回调函数，其中包含将作为 transition 一部分执行的逻辑，
 *                                通常是状态更新。
 */
function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	setPending(true);
	const prevTransition = currentBatchConfig.transition;
	currentBatchConfig.transition = 1;

	callback();
	setPending(false);

	currentBatchConfig.transition = prevTransition;
}

/**
 * @description 当你调用由 useState 返回的那个用于更新状态的函数时，最终就会执行到这个 dispatchSetState。
 *              它的主要职责是：
 *              1. **请求更新优先级 (Lane)**: 调用 `requestUpdateLane` 来确定本次状态更新的优先级。
 *              2. **创建更新对象 (Update)**: 使用传入的 `action` (新的状态值或一个返回新状态的函数) 和获取到的 `lane` 来创建一个 `Update` 对象。
 *              3. **尝试 Eager State 优化**:
 *                 - 如果当前 Fiber 节点及其 alternate 都没有待处理的更新 (即 `fiber.lanes` 和 `current.lanes` 均为 `NoLanes`)，
 *                   这表明这是该 Fiber 节点自上次渲染以来的首次更新。
 *                 - 在这种情况下，会尝试“急切地”(eagerly)计算新状态：
 *                   - 使用 `basicStateReducer` 和 `updateQueue.lastRenderedState` (上一次渲染的状态) 以及当前的 `action` 来计算出 `eagerState`。
 *                   - 如果计算出的 `eagerState` 与 `lastRenderedState` 相同 (通过 `Object.is` 比较)，
 *                     则认为状态没有实际变化，可以进行优化。
 *                   - 此时，`Update` 对象会被标记为 `hasEagerState` 和 `eagerState`，
 *                     并以 `NoLane` 的优先级入队 (`enqueueUpdate`)。这意味着如果后续没有其他更高优先级的更新，
 *                     这个更新本身可能不会触发一次完整的重新渲染。然后函数直接返回，实现 bailout。
 *              4. **入队更新**: 如果 Eager State 优化不适用或未命中，则将创建的 `Update` 对象
 *                 (带有其原始的 `lane`) 添加到 `fiber` 节点的 `updateQueue` 中 (通过 `enqueueUpdate`)。
 *                 `enqueueUpdate` 还会将 `lane` 合并到 `fiber.lanes` 和 `fiber.alternate.lanes` 中，
 *                 标记该 Fiber 节点在此优先级上有待处理的工作。
 *              5. **调度更新**: 调用 `scheduleUpdateOnFiber` 来通知 React 调度器，
 *                 该 `fiber` 节点有新的更新需要在指定的 `lane` 上处理，从而触发后续的渲染流程。
 *
 * @template State - 状态的类型。
 * @param {FiberNode} fiber - 与此状态更新关联的 FiberNode (通常是函数组件的 FiberNode)。
 * @param {FCUpdateQueue<State>} updateQueue - 该 `useState` Hook 对应的更新队列。
 * @param {Action<State>} action - 用户调用 `setState` 时传入的参数，
 *                                 可以是新的状态值，也可以是一个接收前一个状态并返回新状态的函数。
 */
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: FCUpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane();
	const update = createUpdate(action, lane);

	// eager策略
	const current = fiber.alternate;
	if (
		fiber.lanes === NoLanes &&
		(current === null || current.lanes === NoLanes)
	) {
		// 当前产生的update是这个fiber的第一个update
		// 1. 更新前的状态 2.计算状态的方法
		const currentState = updateQueue.lastRenderedState;
		const eagarState = basicStateReducer(currentState, action);
		update.hasEagerState = true;
		update.eagerState = eagarState;

		if (Object.is(currentState, eagarState)) {
			enqueueUpdate(updateQueue, update, fiber, NoLane);
			// 命中eagerState
			if (__DEV__) {
				console.warn('命中eagerState', fiber);
			}
			return;
		}
	}

	enqueueUpdate(updateQueue, update, fiber, lane);

	// 3. 为这个组件安排一次重新渲染。
	scheduleUpdateOnFiber(fiber, lane);
}

/**
 * @description 在函数组件的初始挂载阶段，创建一个 Hook 对象，并插入到链表中
 * @returns 返回新创建并链接好的 Hook 对象（空的）。
 */
function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null,
		baseQueue: null,
		baseState: null
	};

	// 函数组件的第一个 Hook
	if (workInProgressHook === null) {
		// 这是这个函数组件里的第一个 Hook (比如第一次调用 useState)。
		if (currentlyRenderingFiber === null) {
			// 如果不是，那就有问题了 —— Hook 只能在函数组件内部调用。
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = hook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// 不是这个函数组件里的第一个 Hook
		// 我们需要把这个新的 `hook` 连接到现有 Hook 链条的末尾。
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}

	return workInProgressHook;
}

function use<T>(usable: Usable<T>): T {
	if (usable !== null && typeof usable === 'object') {
		if (typeof (usable as Thenable<T>).then === 'function') {
			const thenable = usable as Thenable<T>;
			return trackUsedThenable(thenable);
		} else if ((usable as ReactContext<T>).$$typeof === REACT_CONTEXT_TYPE) {
			const context = usable as ReactContext<T>;
			return readContext(context);
		}
	}
	throw new Error('不支持的use参数 ' + usable);
}

/**
 * @function resetHooksOnUnwind
 * @description 在 "unwind" 阶段（例如，当处理错误或 Suspense 挂起时，从发生问题的 Fiber 节点向上回溯时）
 *              重置模块级的 Hook 相关状态变量。
 *              这包括将 `currentlyRenderingFiber`、`currentHook` 和 `workInProgressHook` 设置为 `null`。
 *              这样做的目的是确保在后续的渲染尝试（例如，错误边界捕获错误后的重渲染，或 Suspense 边界在数据加载后恢复渲染）中，
 *              Hook 的状态能够从一个干净的初始状态开始，避免因先前中断的渲染而导致状态错乱。
 *
 * @param {FiberNode} wip - (未使用) 当前正在进行 unwind 操作的 work-in-progress Fiber 节点。虽然传入了此参数，但在当前实现中并未直接使用它来重置状态。
 */
export function resetHooksOnUnwind(wip: FiberNode) {
	currentlyRenderingFiber = null;
	currentHook = null;
	workInProgressHook = null;
}

/**
 * @function bailoutHook
 * @description 当一个函数组件在 `beginWork` 阶段可以进行 bailout 优化时（即其 props、state 和 context
 *              在当前 `renderLane` 下没有发生需要重新渲染的变化），此函数被调用。
 *              它执行以下操作以确保 bailout 的正确性：
 *              1. 将 `wip` (work-in-progress) Fiber 节点的 `updateQueue` 设置为 `current`
 *                 (上一次渲染的 Fiber 节点) 的 `updateQueue`。这确保了即使组件本身不重新执行，
 *                 其 Hooks (特别是 `useEffect`) 的状态和 Effect 链表仍然是基于上一次渲染的结果，
 *                 以便在 commit 阶段正确处理 `useEffect` 的销毁和创建逻辑（如果依赖项变化，
 *                 则 bailout 不会发生；如果依赖项未变，则销毁和创建回调不应执行）。
 *              2. 从 `wip.flags` 中移除 `PassiveEffect` 标记。因为组件 bailout 了，
 *                 意味着它的 `useEffect` 回调（创建函数）不应该在本次 commit 阶段执行。
 *              3. 从 `current.lanes` 中移除当前的 `renderLane`，表示与此 `renderLane` 相关的工作
 *                 在该 Fiber 节点上已经通过 bailout 完成。
 * @param {FiberNode} wip - 当前正在处理的 work-in-progress Fiber 节点，它是 bailout 的目标。
 * @param {Lane} renderLane - 当前渲染工作的优先级 Lane。
 */
export function bailoutHook(wip: FiberNode, renderLane: Lane) {
	const current = wip.alternate as FiberNode;
	wip.updateQueue = current.updateQueue;
	wip.flags &= ~PassiveEffect;

	current.lanes = removeLanes(current.lanes, renderLane);
}

/**
 * @function mountCallback
 * @description `useCallback` Hook 在组件首次挂载时的实现。
 *              它会：
 *              1. 调用 `mountWorkInProgressHook` 来创建一个新的 Hook 对象。
 *              2. 将传入的 `callback` 函数和依赖项数组 `deps` (如果未提供则为 `null`)
 *                 存储为一个数组 `[callback, deps]` 在新 Hook 对象的 `memoizedState` 中。
 *              3. 直接返回传入的 `callback` 函数。
 *                 在挂载阶段，`useCallback` 总是返回用户提供的原始回调函数。
 * @template T - 回调函数的类型。
 * @param {T} callback - 用户希望 memoize 的回调函数。
 * @param {HookDeps | undefined} deps - (可选) 依赖项数组。如果提供，当依赖项发生变化时，`useCallback` 会返回一个新的回调函数。
 * @returns {T} 返回传入的 `callback` 函数。
 */
function mountCallback<T>(callback: T, deps: HookDeps | undefined) {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	hook.memoizedState = [callback, nextDeps];
	return callback;
}

/**
 * @function updateCallback
 * @description `useCallback` Hook 在组件更新阶段的实现。
 *              它会：
 *              1. 调用 `updateWorkInProgressHook` 来获取或创建与当前 `useCallback` 调用对应的
 *                 work-in-progress Hook 对象，并从 `currentHook` 继承状态。
 *              2. 获取新的依赖项数组 `nextDeps` (如果未提供则为 `null`)。
 *              3. 从上一次渲染的 Hook 状态 (`prevState = hook.memoizedState`) 中获取之前存储的回调函数和依赖项。
 *              4. **依赖项比较**:
 *                 - 如果 `nextDeps` (新的依赖项) 不为 `null`：
 *                   - 调用 `areHookInputsEqual` 比较 `nextDeps` 和 `prevState[1]` (旧的依赖项)。
 *                   - 如果依赖项相等，则直接返回 `prevState[0]` (上一次 memoized 的回调函数)，
 *                     从而避免创建新的回调函数。
 *              5. **返回新回调**: 如果依赖项不相等，或者没有提供依赖项 (`nextDeps` 为 `null`，意味着每次都应返回新回调)，
 *                 则将新的 `callback` 和 `nextDeps` 存储在当前 Hook 的 `memoizedState` 中，并返回新的 `callback` 函数。
 * @template T - 回调函数的类型。
 * @param {T} callback - 用户希望 memoize 的回调函数。
 * @param {HookDeps | undefined} deps - (可选) 依赖项数组。
 * @returns {T} 如果依赖项未改变，则返回上一次 memoized 的回调函数；否则返回新传入的 `callback` 函数。
 */
function updateCallback<T>(callback: T, deps: HookDeps | undefined) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	const prevState = hook.memoizedState;

	if (nextDeps !== null) {
		const prevDeps = prevState[1];
		if (areHookInputsEqual(nextDeps, prevDeps)) {
			return prevState[0];
		}
	}
	hook.memoizedState = [callback, nextDeps];
	return callback;
}

/**
 * @function mountMemo
 * @description `useMemo` Hook 在组件首次挂载时的实现。
 *              它会：
 *              1. 调用 `mountWorkInProgressHook` 来创建一个新的 Hook 对象。
 *              2. 获取依赖项数组 `nextDeps` (如果未提供则为 `null`)。
 *              3. 执行用户提供的 `nextCreate` 函数来计算初始的 memoized 值 (`nextValue`)。
 *              4. 将计算得到的 `nextValue` 和 `nextDeps` 存储为一个数组 `[nextValue, nextDeps]`
 *                 在当前 Hook 对象的 `memoizedState` 中。
 *              5. 直接返回计算得到的 `nextValue`。
 *                 在挂载阶段，`useMemo` 总是执行 `nextCreate` 并返回其结果。
 * @template T - memoized 值的类型。
 * @param {() => T} nextCreate - 一个函数，其返回值将被 memoize。
 * @param {HookDeps | undefined} deps - (可选) 依赖项数组。
 * @returns {T} 返回由 `nextCreate` 函数计算得到的 memoized 值。
 */
function mountMemo<T>(nextCreate: () => T, deps: HookDeps | undefined) {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	const nextValue = nextCreate();
	hook.memoizedState = [nextValue, nextDeps];
	return nextValue;
}

/**
 * @function updateMemo
 * @description `useMemo` Hook 在组件更新阶段的实现。
 *              它会：
 *              1. 调用 `updateWorkInProgressHook` 来获取或创建与当前 `useMemo` 调用对应的
 *                 work-in-progress Hook 对象，并从 `currentHook` 继承状态。
 *              2. 获取新的依赖项数组 `nextDeps` (如果未提供则为 `null`)。
 *              3. 从上一次渲染的 Hook 状态 (`prevState = hook.memoizedState`) 中获取之前存储的 memoized 值和依赖项。
 *              4. **依赖项比较**:
 *                 - 如果 `nextDeps` (新的依赖项) 不为 `null`：
 *                   - 调用 `areHookInputsEqual` 比较 `nextDeps` 和 `prevState[1]` (旧的依赖项)。
 *                   - 如果依赖项相等，则直接返回 `prevState[0]` (上一次 memoized 的值)，
 *                     从而避免重新计算。
 *              5. **重新计算并返回新值**: 如果依赖项不相等，或者没有提供依赖项 (`nextDeps` 为 `null`，意味着每次都应重新计算)，
 *                 则执行 `nextCreate` 函数来计算新的 memoized 值 (`nextValue`)。
 *                 然后将 `nextValue` 和 `nextDeps` 存储在当前 Hook 的 `memoizedState` 中，并返回 `nextValue`。
 * @template T - memoized 值的类型。
 * @param {() => T} nextCreate - 一个函数，其返回值将被 memoize。
 * @param {HookDeps | undefined} deps - (可选) 依赖项数组。
 * @returns {T} 如果依赖项未改变，则返回上一次 memoized 的值；否则返回由 `nextCreate` 函数新计算得到的值。
 */
function updateMemo<T>(nextCreate: () => T, deps: HookDeps | undefined) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	const prevState = hook.memoizedState;

	if (nextDeps !== null) {
		const prevDeps = prevState[1];
		if (areHookInputsEqual(nextDeps, prevDeps)) {
			return prevState[0];
		}
	}
	const nextValue = nextCreate();
	hook.memoizedState = [nextValue, nextDeps];
	return nextValue;
}
