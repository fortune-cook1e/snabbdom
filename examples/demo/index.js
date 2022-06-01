import {
  init,
  classModule,
  styleModule,
  eventListenersModule,
  h,
} from "../../build/index.js";

let vnode;

const patch = init([classModule, styleModule, eventListenersModule]);

function render() {
  vnode = patch(vnode, view2());
}

const view = () =>
  h("div#container.two.classes", [
    h("span", { key: "span1" }, "This is span1"),
    h("span", { key: "span2" }, "This is span2"),
  ]);

const view2 = () =>
  h("div#container.two.classes", [
    h("span", { key: "span3" }, "This is span3"),
    h("span", { key: "span4" }, "This is span4"),
    h("span", { key: "span2" }, "This is span2"),
    h("span", { key: "span1" }, "This is span1"),
  ]);

const btn = document.getElementById("btn");

window.onload = function () {
  const container = document.getElementById("container");
  console.log("初次render开始");
  vnode = patch(container, view());
  console.log("初次render完成");
};

btn.onclick = function () {
  render();
};
