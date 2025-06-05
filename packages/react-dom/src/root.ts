// ReactDOM.createRoot(root).render(<App/>)

import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { ReactElementType } from 'shared/ReactTypes';
import { Container } from './hostConfig';
import { initEvent } from './SyntheticEvent';

/**
 * @function createRoot
 * @description 创建一个 React 应用的根。
 *              这是 ReactDOM 的入口点之一，用于将 React 应用挂载到真实的 DOM 容器中。
 *              它会创建一个内部的 FiberRootNode 结构来管理整个应用的 Fiber 树和状态，
 *              并返回一个包含 `render` 方法的对象，用于启动或更新渲染过程。
 *              同时，它会初始化必要的事件监听器（例如，在根容器上监听点击事件）。
 *
 * @param {Container} container - 真实的 DOM 容器元素，React 应用将渲染到这个元素内部。
 *                                通常是一个通过 `document.getElementById()` 获取的 DOM 元素。
 * @returns {{ render: (element: ReactElementType) => ReactElementType }}
 *          返回一个对象，该对象包含一个 `render` 方法。
 *          - `render(element: ReactElementType)`: 调用此方法可以将指定的 React 元素
 *            (通常是应用的根组件，如 `<App />`) 渲染到之前指定的 `container` 中。
 *            如果容器中已经有内容，则会进行更新。
 *            它返回传入的 `element`。
 */
export function createRoot(container: Container) {
	const root = createContainer(container);

	return {
		render(element: ReactElementType) {
			initEvent(container, 'click');
			return updateContainer(element, root);
		}
	};
}
