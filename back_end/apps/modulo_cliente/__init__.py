"""App modulo_cliente.

Portal restrito do cliente da oficina — leitura da OS, assinatura digital,
aprovação/rejeição de itens e acesso a documentos/histórico. Reutiliza os
modelos do `apps.modulo_oficina` (Cliente, OrdemServico, etc.) e expõe um
conjunto de endpoints isolados sob `/api/cliente/`.
"""
