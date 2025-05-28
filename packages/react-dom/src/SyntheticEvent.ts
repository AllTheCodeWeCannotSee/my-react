import { Container } from 'hostConfig';
import {
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_runWithPriority,
	unstable_UserBlockingPriority
} from 'scheduler';
import { Props } from 'shared/ReactTypes';

export const elementPropsKey = '__props';

/**
 * @param validEventTypeList 一个数组，列出了支持的事件类型
 */
const validEventTypeList = ['click'];

type EventCallback = (e: Event) => void;

/**
 * @description 合成事件的接口
 */
interface SyntheticEvent extends Event {
	__stopPropagation: boolean;
}

/**
 * @description 定义了事件路径的接口
 */
interface Paths {
	capture: EventCallback[];
	bubble: EventCallback[];
}

/**
 * @description 扩展了原生的 Element 类型，使其可以拥有 elementPropsKey 这个属性，方便类型检查
 */
export interface DOMElement extends Element {
	[elementPropsKey]: Props;
}

/**
 * @description 把一个 React 元素（FiberNode）的 props 对象存储到它对应的真实 DOM 节点的 __props 属性上。
 */
export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropsKey] = props;
}

/**
 * @description 初始化事件监听的入口，所有该类型的事件（比如所有的点击事件）都会先被这个根容器上的监听器捕获
 * @param container DOM 根节点
 * @param eventType 事件类型
 */
export function initEvent(container: Container, eventType: string) {
	if (!validEventTypeList.includes(eventType)) {
		console.warn('当前不支持', eventType, '事件');
		return;
	}
	if (__DEV__) {
		console.log('初始化事件：', eventType);
	}

	container.addEventListener(eventType, (e) => {
		dispatchEvent(container, eventType, e);
	});
}

/**
 * @description 接收一个原生的浏览器事件对象 e，并将其包装成一个“合成事件”对象
 * @param e 原生的浏览器事件对象
 * @returns 一个“合成事件”对象
 */
function createSyntheticEvent(e: Event) {
	const syntheticEvent = e as SyntheticEvent;
	syntheticEvent.__stopPropagation = false;
	const originStopPropagation = e.stopPropagation;

	// 重写了原生事件的 stopPropagation 方法
	syntheticEvent.stopPropagation = () => {
		syntheticEvent.__stopPropagation = true;
		if (originStopPropagation) {
			originStopPropagation();
		}
	};
	return syntheticEvent;
}

/**
 * @description
 * * 联系：当根容器上注册的事件监听器被触发时，它会被调用。
 * * 流程：
 *      * 从事件的实际目标元素（e.target）开始，向上遍历 DOM 树，收集所有路径上定义的 React 事件处理函数（捕获阶段和冒泡阶段的）。
 *      * 创建一个 React 的合成事件对象（SyntheticEvent），它包装了原生事件对象 e，并提供了一些 React 特有的行为（比如 stopPropagation 的自定义实现）。
 *      * 按照捕获和冒泡的顺序，依次执行收集到的 React 事件处理函数
 * @param container
 * @param eventType
 * @param e
 * @returns
 */
function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targetElement = e.target;

	if (targetElement === null) {
		console.warn('事件不存在target', e);
		return;
	}

	// 1. 收集沿途的事件
	const { bubble, capture } = collectPaths(
		targetElement as DOMElement,
		container,
		eventType
	);
	// 2. 构造合成事件
	const se = createSyntheticEvent(e);

	// 3. 遍历captue
	triggerEventFlow(capture, se);

	if (!se.__stopPropagation) {
		// 4. 遍历bubble
		triggerEventFlow(bubble, se);
	}
}

/**
 * @function triggerEventFlow
 * @description 负责按照顺序执行一个阶段（捕获或冒泡）收集到的所有事件处理函数。
 *              它会遍历事件回调数组，并使用 Scheduler 的 `unstable_runWithPriority`
 *              来确保每个回调在与事件类型相对应的 React 优先级下执行。
 *              如果在执行某个回调后，合成事件的 `__stopPropagation` 标志被设置为 true，
 *              则会停止执行后续的回调，从而实现事件停止传播的逻辑。
 *
 * @param {EventCallback[]} paths - 一个包含事件处理回调函数的数组。
 *                                  这些回调函数是先前通过 `collectPaths` 函数
 *                                  为特定事件阶段（捕获或冒泡）收集的。
 * @param {SyntheticEvent} se - 当前正在处理的合成事件对象。
 *                              它包装了原生的浏览器事件，并提供了额外的属性和方法，
 *                              如 `__stopPropagation` 标志和自定义的 `stopPropagation` 方法。
 */
function triggerEventFlow(paths: EventCallback[], se: SyntheticEvent) {
	for (let i = 0; i < paths.length; i++) {
		const callback = paths[i];
		unstable_runWithPriority(eventTypeToSchdulerPriority(se.type), () => {
			callback.call(null, se);
		});

		if (se.__stopPropagation) {
			break;
		}
	}
}

/**
 * @description 将浏览器原生的事件名称映射到 React 组件时期望的事件处理器 prop 名称
 */
function getEventCallbackNameFromEventType(
	eventType: string
): string[] | undefined {
	return {
		// 顺序重要，[捕获，冒泡]
		click: ['onClickCapture', 'onClick'] // 如果 eventType 是 'click': 那么就会返回数组 ['onClickCapture', 'onClick']
	}[eventType];
}

/**
 * @function collectPaths
 * @description 收集从事件目标元素到容器元素路径上所有相关的 React 事件处理函数。
 *              它会模拟事件的捕获和冒泡阶段，将路径上 DOM 元素对应的 React 组件中
 *              定义的事件处理函数分别收集到捕获数组和冒泡数组中。
 *
 * @param {DOMElement} targetElement - 实际触发事件的 DOM 元素。
 *                                     这个元素应该已经被 `updateFiberProps` 处理过，
 *                                     拥有 `[elementPropsKey]` (即 `__props`) 属性，
 *                                     其中存储了 React 组件的 props (包括事件处理函数)。
 * @param {Container} container - React 应用的根 DOM 容器元素。遍历将在此元素停止。
 * @param {string} eventType - 发生的事件类型字符串，例如 'click'。
 *                             此类型会通过 `getEventCallbackNameFromEventType` 映射到
 *                             React prop 名称 (如 'onClick' 和 'onClickCapture')。
 * @returns {Paths} 一个包含两个数组的对象：
 *                  - `capture`: 按捕获顺序（从容器到目标元素的父级）排列的事件处理函数。
 *                  - `bubble`: 按冒泡顺序（从目标元素到容器的父级）排列的事件处理函数。
 */
function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	// 存储收集到的事件处理函数
	const paths: Paths = {
		capture: [], // 存储捕获阶段的函数
		bubble: [] // 存储冒泡阶段的函数
	};

	// 向上遍历
	while (targetElement && targetElement !== container) {
		// 收集事件处理函数
		const elementProps = targetElement[elementPropsKey];
		if (elementProps) {
			// click -> onClick onClickCapture
			const callbackNameList = getEventCallbackNameFromEventType(eventType);
			if (callbackNameList) {
				callbackNameList.forEach((callbackName, i) => {
					// onClick -> elementProps.onClick
					const eventCallback = elementProps[callbackName];
					if (eventCallback) {
						if (i === 0) {
							// capture
							paths.capture.unshift(eventCallback); // 捕获阶段的事件是从父到子执行的
						} else {
							paths.bubble.push(eventCallback); // 冒泡阶段的事件是从子到父执行的
						}
					}
				});
			}
		}
		targetElement = targetElement.parentNode as DOMElement;
	}
	return paths;
}

/**
 * @function eventTypeToSchdulerPriority
 * @description 根据 DOM 事件的类型，将其映射到 Scheduler 包中定义的相应优先级。
 * @param {string} eventType - DOM 事件的类型字符串，例如 'click', 'scroll', 'keydown' 等。
 * @returns {number} Scheduler 包中定义的优先级常量。
 */
function eventTypeToSchdulerPriority(eventType: string) {
	switch (eventType) {
		case 'click':
		case 'keydown':
		case 'keyup':
			return unstable_ImmediatePriority;
		case 'scroll':
			return unstable_UserBlockingPriority;
		default:
			return unstable_NormalPriority;
	}
}
