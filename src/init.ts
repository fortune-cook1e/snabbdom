import { Module } from "./modules/module";
import { vnode, VNode } from "./vnode";
import * as is from "./is";
import { htmlDomApi, DOMAPI } from "./htmldomapi";

type NonUndefined<T> = T extends undefined ? never : T;

function isUndef(s: any): boolean {
  return s === undefined;
}
function isDef<A>(s: A): s is NonUndefined<A> {
  return s !== undefined;
}

type VNodeQueue = VNode[];

const emptyNode = vnode("", {}, [], undefined, undefined);

// 判断是否为同一个vnode
function sameVnode(vnode1: VNode, vnode2: VNode): boolean {
  const isSameKey = vnode1.key === vnode2.key;
  const isSameIs = vnode1.data?.is === vnode2.data?.is;
  const isSameSel = vnode1.sel === vnode2.sel; // selector: #app #root 这种

  return isSameSel && isSameKey && isSameIs;
}

// 判断是否为vnode
function isVnode(vnode: any): vnode is VNode {
  return vnode.sel !== undefined;
}

type KeyToIndexMap = { [key: string]: number };

type ArraysOf<T> = {
  [K in keyof T]: Array<T[K]>;
};

type ModuleHooks = ArraysOf<Required<Module>>;

// 返回一个map，key为child的key属性，值为child的索引值
function createKeyToOldIdx(
  children: VNode[],
  beginIdx: number,
  endIdx: number
): KeyToIndexMap {
  const map: KeyToIndexMap = {};
  for (let i = beginIdx; i <= endIdx; ++i) {
    const key = children[i]?.key;
    if (key !== undefined) {
      map[key as string] = i;
    }
  }
  return map;
}

const hooks: Array<keyof Module> = [
  "create", // a DOM element has been created based on a vnode
  "update", // an element is being updated
  "remove", // an element is directly being removed from the DOM
  "destroy", // an element is directly or indirectly being removed
  "pre", // an element is about to be patched
  "post", // the patch process is done
];

/**
 * @description 初始化函数
 * @param {Array} modules 如果传递 styleModule 那么就会处理 vnode 的style属性；不传则不处理
 * @param {DOMAPI} domApi 个人觉得这个地方是用来做跨平台处理
 * @date 2022-05-05 12:11:02
 */
export function init(modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  const cbs: ModuleHooks = {
    create: [],
    update: [],
    remove: [],
    destroy: [],
    pre: [],
    post: [],
  };

  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi;

  // 给对应的钩子增加需要处理的module
  // 这里假设 modules 传递了 [styleModule]
  for (const hook of hooks) {
    for (const module of modules) {
      // currentHook = styleModule[create | update ...]
      const currentHook = module[hook];
      if (currentHook !== undefined) {
        // cbs[create].push(styleModule[create])
        (cbs[hook] as any[]).push(currentHook);
      }
    }
  }

  // 根据一个dom节点创建一个空data的vnode
  function emptyNodeAt(elm: Element) {
    const id = elm.id ? "#" + elm.id : "";

    // elm.className doesn't return a string when elm is an SVG element inside a shadowRoot.
    // https://stackoverflow.com/questions/29454340/detecting-classname-of-svganimatedstring
    const classes = elm.getAttribute("class");

    const c = classes ? "." + classes.split(" ").join(".") : "";

    // 返回一个新 vnode 属性数据
    return vnode(
      api.tagName(elm).toLowerCase() + id + c,
      {},
      [],
      undefined,
      elm
    );
  }

  // 将删除节点的操作包一层，最终放在remove hook中调用
  function createRmCb(childElm: Node, listeners: number) {
    return function rmCb() {
      if (--listeners === 0) {
        const parent = api.parentNode(childElm) as Node;
        api.removeChild(parent, childElm);
      }
    };
  }

  // 根据vnode 创建DOM树
  function createElm(vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    let i: any;
    let data = vnode.data;
    // 调用初始化init hook钩子函数
    if (data !== undefined) {
      const init = data.hook?.init;
      if (isDef(init)) {
        init(vnode);
        data = vnode.data;
      }
    }

    const children = vnode.children;
    const sel = vnode.sel;

    // 处理comment注释
    if (sel === "!") {
      if (isUndef(vnode.text)) {
        vnode.text = "";
      }
      vnode.elm = api.createComment(vnode.text!);
    } else if (sel !== undefined) {
      // Parse selector
      // 查询# . id和class选择器

      // 这里以 div#app .container 为例
      const hashIdx = sel.indexOf("#"); // 3
      const dotIdx = sel.indexOf(".", hashIdx); // 8
      const hash = hashIdx > 0 ? hashIdx : sel.length; // 3
      const dot = dotIdx > 0 ? dotIdx : sel.length; // 8

      // 解析拿标签,div span 等

      // 拿到div
      const tag =
        hashIdx !== -1 || dotIdx !== -1
          ? sel.slice(0, Math.min(hash, dot)) // 'div#app.container'.slice(0,Math.min(3,7))
          : sel;

      // 如果不是svg类型则调用 createElement
      const elm = (vnode.elm =
        isDef(data) && isDef((i = data.ns))
          ? api.createElementNS(i, tag, data)
          : api.createElement(tag, data));

      // 设置id属性
      if (hash < dot) elm.setAttribute("id", sel.slice(hash + 1, dot));

      // 设置class属性
      if (dotIdx > 0)
        elm.setAttribute("class", sel.slice(dot + 1).replace(/\./g, " "));

      // 调用create hook函数
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode);

      // 如果vnode有children 那么遍历children 添加到vnode对应的Element中
      if (is.array(children)) {
        for (i = 0; i < children.length; ++i) {
          const ch = children[i];
          if (ch != null) {
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue));
          }
        }
        // 如果vnode没有children 只有 text属性 则创建一个 text 节点
      } else if (is.primitive(vnode.text)) {
        api.appendChild(elm, api.createTextNode(vnode.text));
      }

      const hook = vnode.data!.hook;

      // TODO: 这里的if else 没看明白什么意思
      if (isDef(hook)) {
        hook.create?.(emptyNode, vnode);
        // TODO: 调用 create hook；为 insert hook 填充 insertedVnodeQueue。(这里不太明白为什么这么做)
        if (hook.insert) {
          insertedVnodeQueue.push(vnode);
        }
      }
    } else {
      // 处理text为空的情况
      vnode.elm = api.createTextNode(vnode.text!);
    }
    return vnode.elm;
  }

  // 在element元素中插入新元素
  function addVnodes(
    parentElm: Node, // dom节点
    before: Node | null,
    vnodes: VNode[], // 虚拟dom节点列表
    startIdx: number, // 起始索引
    endIdx: number, // 结束索引
    insertedVnodeQueue: VNodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx];
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before);
      }
    }
  }

  // 递归对vnode以及children节点 调用 destroy Hook 钩子函数
  function invokeDestroyHook(vnode: VNode) {
    const data = vnode.data;
    if (data !== undefined) {
      data?.hook?.destroy?.(vnode);
      for (let i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode);

      if (vnode.children !== undefined) {
        for (let j = 0; j < vnode.children.length; ++j) {
          const child = vnode.children[j];
          if (child != null && typeof child !== "string") {
            invokeDestroyHook(child);
          }
        }
      }
    }
  }

  // 删除dom节点
  function removeVnodes(
    parentElm: Node, // 父元素
    vnodes: VNode[], // vnode的children节点数组
    startIdx: number, // 起始索引
    endIdx: number // 结束索引
  ): void {
    for (; startIdx <= endIdx; ++startIdx) {
      let listeners: number;
      let rm: () => void;
      const ch = vnodes[startIdx];
      if (ch != null) {
        if (isDef(ch.sel)) {
          invokeDestroyHook(ch);
          listeners = cbs.remove.length + 1;
          rm = createRmCb(ch.elm!, listeners);
          for (let i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm);

          const removeHook = ch?.data?.hook?.remove;

          if (isDef(removeHook)) {
            removeHook(ch, rm);
          } else {
            rm();
          }
        } else {
          // Text node
          api.removeChild(parentElm, ch.elm!);
        }
      }
    }
  }

  // TIP:核心点
  function updateChildren(
    parentElm: Node,
    oldCh: VNode[],
    newCh: VNode[],
    insertedVnodeQueue: VNodeQueue
  ) {
    console.log("update chidlren...");
    let oldStartIdx = 0;
    let newStartIdx = 0;
    let oldEndIdx = oldCh.length - 1;
    let oldStartVnode = oldCh[0];
    let oldEndVnode = oldCh[oldEndIdx];
    let newEndIdx = newCh.length - 1;
    let newStartVnode = newCh[0];
    let newEndVnode = newCh[newEndIdx];
    let oldKeyToIdx: KeyToIndexMap | undefined;
    let idxInOld: number;
    let elmToMove: VNode;
    let before: any;

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (oldStartVnode == null) {
        // 旧节点第一个子节点不存在的话那么右移
        oldStartVnode = oldCh[++oldStartIdx]; // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        // 旧节点子节点左移
        oldEndVnode = oldCh[--oldEndIdx];
      } else if (newStartVnode == null) {
        // 新节点子节点右移
        newStartVnode = newCh[++newStartIdx];
      } else if (newEndVnode == null) {
        // 新节点子节点左移
        newEndVnode = newCh[--newEndIdx];
      }
      // oldStartVnode/oldEndVnode/newStartVnode/newEndVnode 两两比较

      // 新旧startVnode 进行比较
      else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];
      }
      // 新旧 endVnode 进行比较
      else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];
      }
      // 旧startVnode 与 新 endVnode 比较
      else if (sameVnode(oldStartVnode, newEndVnode)) {
        // Vnode moved right

        // TIP:
        // （1）oldStartVnode 和 newEndVnode 相同，显然是 vnode 右移了。
        // （2）若 while 循环刚开始，那移到 oldEndVnode.elm 右边就是最右边，是合理的；
        // （3）若循环不是刚开始，因为比较过程是两头向中间，那么两头的 dom 的位置已经是
        //     合理的了，移动到 oldEndVnode.elm 右边是正确的位置；
        // （4）记住，oldVnode 和 vnode 是相同的才 patch，且 oldVnode 自己对应的 dom
        //     总是已经存在的，vnode 的 dom 是不存在的，直接复用 oldVnode 对应的 dom。
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);

        // 因为新旧vnode 是在相同情况下才patch 并且新vnode 没有dom，所以直接复用旧vnode的elm
        api.insertBefore(
          parentElm,
          oldStartVnode.elm!,
          api.nextSibling(oldEndVnode.elm!)
        );
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        // Vnode moved left

        // TIP: 与上面同理
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
        api.insertBefore(parentElm, oldEndVnode.elm!, oldStartVnode.elm!);
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];
      }

      // 4个vnode都不相同
      else {
        // TODO: 这里需要深度研究一下
        // 创建一个旧children中存在key的map，key为key，value为旧children的索引
        if (oldKeyToIdx === undefined) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        }
        // 找到newStartNode的key在 旧 key,index 的索引值
        idxInOld = oldKeyToIdx[newStartVnode.key as string];
        // 如果没有索引值，说明startVnode是全新，直接将新的vnode插入到旧startVnode前面即可
        if (isUndef(idxInOld)) {
          // New element
          api.insertBefore(
            parentElm,
            createElm(newStartVnode, insertedVnodeQueue),
            oldStartVnode.elm!
          );
        }
        // 如果索引值存在,说明新旧vnode中有相同key的vnode
        else {
          elmToMove = oldCh[idxInOld];
          // 如果新旧vnode的selector不一样 那么直接创建新的dom 插入到旧的startVnode前面
          if (elmToMove.sel !== newStartVnode.sel) {
            api.insertBefore(
              parentElm,
              createElm(newStartVnode, insertedVnodeQueue),
              oldStartVnode.elm!
            );
          }
          // 如果selector一样，直接移动key值相同的vnode即可(复用旧vnode)
          else {
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
            // 这里设置为undefined之后 最初的判断就会进行 oldStartIdx++操作，不断右移判断
            oldCh[idxInOld] = undefined as any;
            api.insertBefore(parentElm, elmToMove.elm!, oldStartVnode.elm!);
          }
        }
        // 重新赋值新的startVnode
        newStartVnode = newCh[++newStartIdx];
      }
    }

    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
      if (oldStartIdx > oldEndIdx) {
        before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm;
        addVnodes(
          parentElm,
          before,
          newCh,
          newStartIdx,
          newEndIdx,
          insertedVnodeQueue
        );
      } else {
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
      }
    }
  }

  // 对相同vnode进行patch
  // 相同vnode 的特征 sel、data.is、key同时相同
  function patchVnode(
    oldVnode: VNode,
    vnode: VNode,
    insertedVnodeQueue: VNodeQueue
  ) {
    const hook = vnode.data?.hook;
    // 执行vnode中需要在 patch前执行的函数
    hook?.prepatch?.(oldVnode, vnode);

    // 复用旧vnode的dom节点
    const elm = (vnode.elm = oldVnode.elm)!;

    const oldCh = oldVnode.children as VNode[]; // 旧vnode子节点
    const ch = vnode.children as VNode[]; // 新vnode的子节点

    // 如果两者引用完全相同 则直接return
    if (oldVnode === vnode) return;

    if (vnode.data !== undefined) {
      for (let i = 0; i < cbs.update.length; ++i)
        // 执行更新的hook
        // 这里以styleModule为例
        // 执行 styleModule的update hook 也就是 updateStyle函数（modules/styles.ts）
        cbs.update[i](oldVnode, vnode);
      vnode.data.hook?.update?.(oldVnode, vnode);
    }

    // TIP: 判断新vnode有无text
    // 1. 新vnode有text
    // 1) 新旧vnode 是否都有 children；如果新旧vnode 不相同 则更新 chidlren (核心)
    // 2) 如果新vnode有children 说明 增加了 children 子节点；进行addnodes即可
    // 3) 如果新vnode 没有children 但旧vnode有 进行删除children即可
    // 4) 如果新旧vnode都没有children  但旧vnode有text属性，只需要将dom节点Element的text属性设置为空即可

    // 2. 新旧vnode的text不相同（新vnode有text文本）
    // 如果旧vnode有children，那么删除原先dom的所有children 然后塞入新vnode的text文本即可
    if (isUndef(vnode.text)) {
      if (isDef(oldCh) && isDef(ch)) {
        // 比较新旧节点的子节点
        // TIP: 这一块是核心
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue);
      } else if (isDef(ch)) {
        // 新vnode有子节点，旧节点没子节点情况
        // 说明新增了子节点
        if (isDef(oldVnode.text)) api.setTextContent(elm, ""); // TODO: 这里不知道为什么要将元素的textcontent设置为空
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);
      } else if (isDef(oldCh)) {
        // 新节点没有children，旧节点有children
        // 说明删除节点
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);
      } else if (isDef(oldVnode.text)) {
        api.setTextContent(elm, "");
      }

      // vnode的text存在说明新节点时纯本文节点；
    } else if (oldVnode.text !== vnode.text) {
      if (isDef(oldCh)) {
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);
      }
      // 将element的textContent属性设置为新vnode的text属性即可
      api.setTextContent(elm, vnode.text!);
    }
    // 所有patch完成后需要执行的callback
    hook?.postpatch?.(oldVnode, vnode);
  }

  return function patch(oldVnode: VNode | Element, vnode: VNode): VNode {
    console.log("patch 开始执行...");

    let i: number, elm: Node, parent: Node;
    // TODO: 不太懂这个需要插入的vnode 队列的意义在哪
    const insertedVnodeQueue: VNodeQueue = [];
    // 执行 回调中所有modules的 pre 函数
    // styleModule 则执行 forceReflow
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]();

    // 如果旧节点不是虚拟vnode(真实的Dom节点)
    // 那么根据真实DOM创建一个空data的vnode
    // TIP: 该情况只出现在初次渲染时
    if (!isVnode(oldVnode)) {
      oldVnode = emptyNodeAt(oldVnode);
    }

    console.log("patch vnode", { oldVnode, vnode });

    // 是否为一个vnode节点
    // 判断是否相同的指标 key/selector/is 相同
    const result = sameVnode(oldVnode, vnode);
    console.log("sameVnode", result);
    if (sameVnode(oldVnode, vnode)) {
      patchVnode(oldVnode, vnode, insertedVnodeQueue);
    } else {
      elm = oldVnode.elm!;
      parent = api.parentNode(elm) as Node;

      // 根据vnode创建vnode的element元素
      createElm(vnode, insertedVnodeQueue);

      if (parent !== null) {
        // 先将新节点插入到原节点的兄弟节点旁
        api.insertBefore(parent, vnode.elm!, api.nextSibling(elm));
        // 然后删除旧节点
        removeVnodes(parent, [oldVnode], 0, 0);
      }
    }

    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data!.hook!.insert!(insertedVnodeQueue[i]);
    }

    // 执行patch完后的hook函数
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]();

    console.log("patch 结束执行...");
    return vnode;
  };
}
