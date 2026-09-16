declare const __BUILD_SHA__: string;

const REPOSITORY_URL = "https://github.com/Proof-Stamp/they_told_me";

const footer = document.querySelector<HTMLElement>("footer");
if (footer) {
  let meta = footer.querySelector<HTMLElement>(".footer-meta");
  if (!meta) {
    meta = document.createElement("span");
    meta.className = "footer-meta";
    footer.append(meta);
  }

  const repository = document.createElement("a");
  repository.className = "footer-repository-link";
  repository.href = REPOSITORY_URL;
  repository.textContent = "GitHub";
  repository.title = "View the source code on GitHub";

  const build = document.createElement("span");
  build.textContent = `Build ${__BUILD_SHA__}`;
  build.title = "Git commit used for this deployment";

  meta.append(repository, build);
}
