// URLs das páginas do front, relativas à baseURL. O front é servido a partir
// de `front_end/src` (mesma raiz do nginx em produção), então as rotas não
// têm prefixo — o base-path.js resolve a navegação interna dinamicamente.
const SRC = "";

export const ROTAS = {
  login: `${SRC}/app/login/pages/login-page.html`,
  recuperar: `${SRC}/app/login/pages/recuperar-acesso.html`,
  selecionarOficina: `${SRC}/app/login/pages/selecionar-oficina.html`,
  dashboard: `${SRC}/modulos/modulo_oficina/dashboard/pages/dashboard.html`,
  cadastroOficina: `${SRC}/modulos/modulo_oficina/cadastro_oficina/pages/cadastro-oficina.html`,
  suporteOficina: `${SRC}/modulos/modulo_oficina/suporte/pages/suporte.html`,
  adminPainel: `${SRC}/modulos/modulo_adm/pages/admin.html`,
  loginCliente: `${SRC}/modulos/modulo_cliente/login/pages/login-cliente.html`,
  portalCliente: `${SRC}/modulos/modulo_cliente/portal/pages/portal-cliente.html`,
};

// Credenciais criadas por `python manage.py seed_e2e` (NÃO usar em produção).
export const E2E_ADMIN = {
  email: "e2e-admin@pitstop.test",
  senha: "E2eAdmin!2024",
};

// Acesso do cliente ao portal (código de acesso + CPF), criado pelo seed.
export const E2E_CLIENTE = {
  codigo: "E2EOS123",
  cpf: "12345678909",
};

// Superusuário do painel SaaS, criado pelo seed.
export const E2E_SUPER = {
  email: "e2e-super@pitstop.test",
  senha: "E2eSuper!2024",
};
