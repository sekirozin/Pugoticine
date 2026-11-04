// Paleta única do Pugoticine: Lima. Remove preferências antigas de tema deste navegador.
(() => {
  let paleta = "lima";
  try { paleta = localStorage.getItem("pugoti-paleta") === "laranja" ? "laranja" : "lima"; } catch {}
  document.documentElement.dataset.pugotiPaleta = paleta;
  document.documentElement.dataset.tema = "2";
  document.documentElement.dataset.modo = "escuro";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#101010");
  try {
    localStorage.removeItem("pugoticine:tema");
    localStorage.removeItem("pugoticine:modo");
  } catch { /* armazenamento pode estar indisponível; a paleta continua aplicada */ }
})();
