"""App modulo_pagamentos.

Integração com a AbacatePay para cobrança SaaS (assinatura mensal da
oficina) e cobrança de Ordens de Serviço (cliente final paga pela OS).
A camada de domínio fica em `services/`, isolada de detalhes de HTTP.
Endpoints REST sob `/api/pagamentos/`.
"""
