// suporte-tab.js (portal do cliente) — chamados do cliente final.

import { renderSuporte } from "../../../../../shared/components/suporte-chat.js";
import { ClienteSuporteApi } from "../../services/cliente-suporte-api.js";


export async function renderSuporteCliente(container) {
  container.innerHTML = `
    <section class="cliente-tab-section" aria-labelledby="hSuporte">
      <header class="section-header">
        <div>
          <h2 id="hSuporte"><i class="fas fa-headset"></i> Suporte</h2>
          <p class="section-sub">
            Abra um chamado para a oficina ou para a equipe Pit Stop. Acompanhe
            as respostas e o histórico em tempo real.
          </p>
        </div>
      </header>
      <div id="clienteSuporteContainer"></div>
    </section>
  `;
  const host = container.querySelector("#clienteSuporteContainer");
  await renderSuporte(host, ClienteSuporteApi, {
    titulo: "Meus chamados",
    modo: "usuario",
    podeCriar: true,
  });
}
