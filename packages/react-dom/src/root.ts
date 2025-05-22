// ReactDOM.createRoot(root).render(<App/>)

import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { ReactElementType } from 'shared/ReactTypes';
import { Container } from './hostConfig';
import { initEvent } from './SyntheticEvent';

/**
 * @description 创建一个 React 应用的根
 * @param container 真实的 DOM 容器元素，React 应用将渲染到这个元素内部
 * @returns 返回一个包含 render 方法的对象，用于渲染 React 元素到容器中
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
