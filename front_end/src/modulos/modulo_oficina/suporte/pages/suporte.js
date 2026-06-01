// suporte.js — entrypoint da tela "Suporte" do módulo oficina.

import { garantirAcesso } from "../../../../shared/services/auth-guard.js";
import { renderSuporte } from "../../../../shared/components/suporte-chat.js";
import { SuporteOficinaApi } from "../services/suporte-oficina-api.js";


document.addEventListener("DOMContentLoaded", async () => {
  if (!(await garantirAcesso({ paginaChave: "suporte" }))) return;

  const container = document.getElementById("suporteContainer");
  await renderSuporte(container, SuporteOficinaApi, {
    titulo: "Meus chamados",
    modo: "usuario",
    podeCriar: true,
  });
});
