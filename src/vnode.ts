import { Hooks } from "./hooks";
import { AttachData } from "./helpers/attachto";
import { VNodeStyle } from "./modules/style";
import { On } from "./modules/eventlisteners";
import { Attrs } from "./modules/attributes";
import { Classes } from "./modules/class";
import { Props } from "./modules/props";
import { Dataset } from "./modules/dataset";

export type Key = string | number | symbol;

export interface VNode {
  sel: string | undefined; // 挂载的dom节点 例: div#container (传递给h函数用)
  data: VNodeData | undefined;  // 添加dom节点属性等
  children: Array<VNode | string> | undefined; // 子节点
  elm: Node | undefined; // 指向真实的dom节点
  text: string | undefined; // 纯文本
  key: Key | undefined; // 指向dom节点 避免重复创建
}

export interface VNodeData {
  props?: Props;
  attrs?: Attrs;
  class?: Classes;
  style?: VNodeStyle;
  dataset?: Dataset;
  on?: On;
  attachData?: AttachData;
  hook?: Hooks;
  key?: Key;
  ns?: string; // for SVGs
  fn?: () => VNode; // for thunks
  args?: any[]; // for thunks
  is?: string; // for custom elements v1
  [key: string]: any; // for any other 3rd party module
}

export function vnode(
  sel: string | undefined,
  data: any | undefined,
  children: Array<VNode | string> | undefined,
  text: string | undefined,
  elm: Element | Text | undefined
): VNode {
  const key = data === undefined ? undefined : data.key;
  return { sel, data, children, text, elm, key };
}
