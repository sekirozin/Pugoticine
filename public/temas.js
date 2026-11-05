// Base do Pugoticine (tokens de temas.css). O Tema Pugotilab escolhido na conta (Lima, Laranja, Brasa, Neon, Volt,
// Selva, Ouro) é aplicado pelo pugoti-conta.js, carregado logo depois. Remove preferências antigas deste navegador.
(() => {
  document.documentElement.dataset.tema = "2";
  document.documentElement.dataset.modo = "escuro";
  try {
    localStorage.removeItem("pugoticine:tema");
    localStorage.removeItem("pugoticine:modo");
  } catch { /* armazenamento pode estar indisponível; a paleta continua aplicada */ }
})();
