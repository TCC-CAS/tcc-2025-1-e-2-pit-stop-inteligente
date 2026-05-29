"""App modulo_suporte.

Sistema de tickets (solicitações de suporte) compartilhado por:
  - Funcionários da oficina (autenticados via sessão Django + Funcionario)
  - Clientes finais (autenticados via sessão do portal do cliente)
  - Equipe administrativa SaaS (staff/superuser)

Concentramos modelos, serializers e services aqui para evitar duplicação.
As rotas REST são divididas em 3 conjuntos (`/api/oficina/suporte/`,
`/api/cliente/suporte/`, `/api/admin/suporte/`) com permissões diferentes,
mas operando sobre os mesmos dados.
"""
