declare const __BUILD_SHA__: string;

const footer = document.querySelector<HTMLElement>("footer");
if (footer) {
  const build = document.createElement("span");
  build.textContent = `Build ${__BUILD_SHA__}`;
  build.title = "Git commit used for this deployment";
  footer.append(build);
}
