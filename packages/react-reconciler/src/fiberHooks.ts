import { FiberNode } from './fiber';

/**
 * @description 执行一个函数式组件 (Function Component) 并获取它渲染出来的内容
 * @param wip 是 FunctionComponent 类型的fibernode
 */
export function renderWithHooks(wip: FiberNode) {
	// wip.type: 这个 type 属性对于函数式组件来说，就是那个组件函数本身
	const Component = wip.type;
	const props = wip.pendingProps;
	const children = Component(props);

	return children;
}
