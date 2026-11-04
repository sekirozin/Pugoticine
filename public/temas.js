// Preferência visual deste navegador. Executado no <head> para aplicar o tema antes da primeira pintura.
(() => {
  const CHAVE = "pugoticine:tema";
  const temas = [
    { id: "1", nome: "Tema 1 — Atual", fundo: "#000000" },
    { id: "2", nome: "Tema 2 — Lima", fundo: "#101010" },
    { id: "3", nome: "Tema 3 — Vinho", fundo: "#651424" },
    { id: "4", nome: "Tema 4 — Azul", fundo: "#0E359D" }
  ];
  const normalizar = (id) => temas.some((t) => t.id === id) ? id : "1";
  const ler = () => { try { return normalizar(localStorage.getItem(CHAVE)); } catch { return "1"; } };
  function aplicar(id) {
    id = normalizar(id);
    document.documentElement.dataset.tema = id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", temas.find(t => t.id === id).fundo);
    const seletor = document.getElementById("tema-seletor");
    if (seletor) seletor.value = id;
    window.dispatchEvent(new CustomEvent("pugoticine:tema", { detail: { id } }));
  }
  aplicar(ler());
  document.addEventListener("DOMContentLoaded", () => {
    const seletor = document.getElementById("tema-seletor");
    if (!seletor) return;
    for (const tema of temas) seletor.add(new Option(tema.nome, tema.id));
    seletor.value = document.documentElement.dataset.tema;
    seletor.addEventListener("change", () => {
      aplicar(seletor.value);
      const status = document.getElementById("tema-status");
      try {
        localStorage.setItem(CHAVE, seletor.value);
        status.textContent = "Tema salvo neste navegador.";
      } catch {
        status.textContent = "Tema aplicado. Este navegador não permitiu salvar a preferência.";
      }
    });
  });
  window.addEventListener("storage", (evento) => {
    if (evento.key === CHAVE || evento.key === null) aplicar(ler());
  });
})();
