// Preferência visual deste navegador. Executado no <head> para aplicar o tema antes da primeira pintura.
(() => {
  const CHAVE = "pugoticine:tema";
  const temas = [
    { id: "1", nome: "Tema 1 — Azul original", destaque: "#263dbb" },
    { id: "2", nome: "Tema 2 — Lima", destaque: "#c8ff00" },
    { id: "3", nome: "Tema 3 — Vinho", destaque: "#ff5825" },
    { id: "4", nome: "Tema 4 — Azul", destaque: "#ff606a" }
  ];
  const CHAVE_MODO = "pugoticine:modo";
  const normalizarModo = (modo) => modo === "claro" ? "claro" : "escuro";
  const lerModo = () => { try { return normalizarModo(localStorage.getItem(CHAVE_MODO)); } catch { return "escuro"; } };
  const normalizar = (id) => temas.some((t) => t.id === id) ? id : "1";
  const ler = () => { try { return normalizar(localStorage.getItem(CHAVE)); } catch { return "1"; } };
  function aplicar(id, modo = lerModo()) {
    id = normalizar(id);
    document.documentElement.dataset.tema = id;
    document.documentElement.dataset.modo = normalizarModo(modo);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", modo === "claro" ? "#f5f5f5" : "#101010");
    const seletor = document.getElementById("tema-seletor");
    if (seletor) seletor.value = id;
    const seletorModo = document.getElementById("modo-seletor");
    if (seletorModo) seletorModo.value = normalizarModo(modo);
    window.dispatchEvent(new CustomEvent("pugoticine:tema", { detail: { id, modo: normalizarModo(modo) } }));
  }
  aplicar(ler(), lerModo());
  document.addEventListener("DOMContentLoaded", () => {
    const seletor = document.getElementById("tema-seletor");
    const seletorModo = document.getElementById("modo-seletor");
    if (!seletor || !seletorModo) return;
    for (const tema of temas) seletor.add(new Option(tema.nome, tema.id));
    seletor.value = document.documentElement.dataset.tema;
    seletorModo.value = document.documentElement.dataset.modo;
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
    seletorModo.addEventListener("change", () => {
      const modo = normalizarModo(seletorModo.value);
      aplicar(seletor.value, modo);
      const status = document.getElementById("tema-status");
      try { localStorage.setItem(CHAVE_MODO, modo); status.textContent = "Modo salvo neste navegador."; }
      catch { status.textContent = "Modo aplicado. Este navegador não permitiu salvar a preferência."; }
    });
  });
  window.addEventListener("storage", (evento) => {
    if ([CHAVE, CHAVE_MODO, null].includes(evento.key)) aplicar(ler(), lerModo());
  });
})();
