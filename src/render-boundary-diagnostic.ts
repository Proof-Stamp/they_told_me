const originalCreateObjectURL = URL.createObjectURL.bind(URL);

URL.createObjectURL = ((object: Blob | MediaSource): string => {
  if (object instanceof Blob && object.type === "application/zip") {
    const status = document.querySelector<HTMLElement>("#create-status");
    if (status) {
      status.textContent = "Proof package built. Preparing download…";
      status.className = "status-box working";
    }
    console.info("[ProofStamp diagnostic] package build returned; creating download URL");
  }
  return originalCreateObjectURL(object);
}) as typeof URL.createObjectURL;
