"""Data migration: atualiza preços/limites dos planos Básico e Premium
conforme o capítulo 6 (Precificação) do TCC, e cria o plano "Teste" de
avaliação (7 dias, 10 OS, gratuito).

Valores oficiais (Quadro Planos de Assinatura do Pit Stop Inteligente):

    Característica         | Básico       | Premium      | Teste (novo)
    -----------------------+--------------+--------------+--------------
    Preço mensal           | R$ 99,90     | R$ 199,90    | R$ 0,00
    Ordens de Serviço/mês  | 30           | 50           | 10 / 7 dias
    Usuários ativos        | 2            | 5            | 1
    Armazenamento          | 1 GB         | 5 GB         | 1 GB
    Duração (dias)         | 30           | 30           | 7

A migration é idempotente — pode rodar várias vezes sem duplicar nada
(usa update_or_create por código).
"""
from django.db import migrations


PLANOS = [
    {
        "codigo": "basico",
        "nome": "Básico",
        "descricao": (
            "Plano inicial para oficinas com volume moderado de OS. "
            "Inclui 30 OS por mês, 2 usuários ativos e 1 GB de armazenamento."
        ),
        "preco_centavos": 9990,            # R$ 99,90/mês
        "limite_usuarios": 2,
        "limite_os_mensal": 30,
        "limite_armazenamento_mb": 1024,   # 1 GB
        "duracao_dias": 30,
        "destaque": False,
        "ativo": True,
        "ordem": 2,
    },
    {
        "codigo": "premium",
        "nome": "Premium",
        "descricao": (
            "Plano completo para oficinas em ritmo intenso. Inclui 50 OS "
            "por mês, 5 usuários ativos, 5 GB de armazenamento e "
            "atendimento de suporte preferencial."
        ),
        "preco_centavos": 19990,           # R$ 199,90/mês
        "limite_usuarios": 5,
        "limite_os_mensal": 50,
        "limite_armazenamento_mb": 5120,   # 5 GB
        "duracao_dias": 30,
        "destaque": True,
        "ativo": True,
        "ordem": 3,
    },
    {
        "codigo": "teste",
        "nome": "Teste",
        "descricao": (
            "Acesso gratuito por 7 dias com até 10 Ordens de Serviço — "
            "ideal para conhecer a plataforma antes de contratar."
        ),
        "preco_centavos": 0,               # gratuito
        "limite_usuarios": 1,
        "limite_os_mensal": 10,            # válido para os 7 dias do plano
        "limite_armazenamento_mb": 1024,   # 1 GB
        "duracao_dias": 7,
        "destaque": False,
        "ativo": True,
        "ordem": 1,                        # aparece primeiro na vitrine
    },
]


def aplicar(apps, schema_editor):
    PlanoSaaS = apps.get_model("modulo_pagamentos", "PlanoSaaS")
    for item in PLANOS:
        PlanoSaaS.objects.update_or_create(
            codigo=item["codigo"],
            defaults={
                "nome": item["nome"],
                "descricao": item["descricao"],
                "preco_centavos": item["preco_centavos"],
                "limite_usuarios": item["limite_usuarios"],
                "limite_os_mensal": item["limite_os_mensal"],
                "limite_armazenamento_mb": item["limite_armazenamento_mb"],
                "duracao_dias": item["duracao_dias"],
                "destaque": item["destaque"],
                "ativo": item["ativo"],
                "ordem": item["ordem"],
            },
        )


def reverter(apps, schema_editor):
    """Reverte apenas a inclusão do plano 'teste' e restaura os preços
    legados de Básico/Premium (R$ 99 e R$ 199). Não removemos Básico/Premium
    pois eles foram criados no 0002 (mesmo seed)."""
    PlanoSaaS = apps.get_model("modulo_pagamentos", "PlanoSaaS")
    AssinaturaOficina = apps.get_model("modulo_pagamentos", "AssinaturaOficina")
    AssinaturaOficina.objects.filter(plano__codigo="teste").delete()
    PlanoSaaS.objects.filter(codigo="teste").delete()

    PlanoSaaS.objects.filter(codigo="basico").update(
        preco_centavos=9900, limite_usuarios=1, limite_os_mensal=100,
        limite_armazenamento_mb=0, duracao_dias=30,
    )
    PlanoSaaS.objects.filter(codigo="premium").update(
        preco_centavos=19900, limite_usuarios=5, limite_os_mensal=0,
        limite_armazenamento_mb=0, duracao_dias=30,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("modulo_pagamentos", "0003_planosaas_duracao_armazenamento"),
    ]

    operations = [
        migrations.RunPython(aplicar, reverter),
    ]
