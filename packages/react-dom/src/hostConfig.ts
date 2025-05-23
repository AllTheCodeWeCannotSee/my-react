// 提供一套针对浏览器 DOM 环境的低级 API 实现，
// 使得平台无关的 React 协调器能够执行真实的 UI 创建、更新和删除操作

// 协调器（react-reconciler）知道 需要 创建一个 DOM 元素、更新一个属性、插入一个子节点或删除一个节点，
// 但它不知道 如何 在浏览器中具体执行这些操作。这些具体的实现细节就由 hostConfig.ts 来提供。

import { FiberNode } from 'react-reconciler/src/fiber';
import { HostText } from 'react-reconciler/src/workTags';
import { Props } from 'shared/ReactTypes';
import { DOMElement, updateFiberProps } from './SyntheticEvent';

/**
 * @description 一个“容器”（Container）就是一个标准的浏览器 Element 对象
 */
export type Container = Element;
/**
 * @description
 * 一个“实例”（Instance）指的是 React 创建和管理的、构成你 UI 的任何单个 DOM 元素
 * 比如对应你 JSX 中宿主组件（host component）的 <div>、<p>、<span> 等
 */
export type Instance = Element;

export type TextInstance = Text;

/**
 * @description -
 * * 首次创建 DOM 节点
 * @param type
 * @param props
 * @returns
 */
export const createInstance = (type: string, props: Props): Instance => {
	// TODO 处理props
	const element = document.createElement(type) as unknown;
	updateFiberProps(element as DOMElement, props);
	return element as DOMElement;
};

/**
 * @description 将子 DOM 元素附加到一个父 DOM 元素上
 */
export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	parent.appendChild(child);
};

/**
 * @description 这个函数用于在 DOM 中创建一个文本节点
 */
export const createTextInstance = (content: string) => {
	return document.createTextNode(content);
};

export const appendChildToContainer = appendInitialChild;

export function commitUpdate(fiber: FiberNode) {
	switch (fiber.tag) {
		case HostText:
			const text = fiber.memoizedProps?.content;
			return commitTextUpdate(fiber.stateNode, text);

		default:
			if (__DEV__) {
				console.warn('未实现的Update类型', fiber);
			}
			break;
	}
}

/**
 * @description 更新一个 DOM 文本节点的内容
 */
export function commitTextUpdate(textInstance: TextInstance, content: string) {
	textInstance.textContent = content;
}

/**
 * @description 这个函数的作用是从父容器中移除一个子 DOM 节点
 */
export function removeChild(
	child: Instance | TextInstance,
	container: Container
) {
	container.removeChild(child);
}

/**
 * @description 将一个指定的子 DOM 节点插入到父 DOM 容器中，并放在另一个指定的子 DOM 节点的前面
 */
export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	container.insertBefore(child, before); // 调用浏览器原生的 insertBefore 方法
}

/**
 * @param scheduleMicroTask 提供一个跨浏览器/环境兼容的方式来调度一个函数（回调函数）作为微任务（microtask）执行
 */
export const scheduleMicroTask =
	typeof queueMicrotask === 'function'
		? queueMicrotask
		: typeof Promise === 'function'
			? (callback: (...args: any) => void) =>
					Promise.resolve(null).then(callback)
			: setTimeout;
