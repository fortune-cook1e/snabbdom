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
  h("div#container.two.classes", { style: { color: "red" } }, [
    h("span", { style: { fontWeight: "bold" }, key: "span.." }, "This is bold"),
    " and this is just normal text",
    h("a", { props: { href: "/foo" } }, "I'll take you places!"),
  ]);

const view2 = () =>
  h("div#container.two.classes", { style: { color: "green" } }, [
    h(
      "span.one.tow",
      { style: { fontWeight: "bold" }, key: "span.." },
      "This is bold"
    ),
  ]);

window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");
  vnode = patch(container, view());
  console.log(vnode);
  render();
  console.log(vnode);
});
