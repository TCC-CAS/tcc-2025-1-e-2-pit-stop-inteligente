"""Data migration: cataloga os planos default e cria assinaturas iniciais.

Decisões:
  - Os preços R$ 99 (Básico) e R$ 199 (Premium) refletem os valores já
    exibidos no front (`atualizacao_dados_oficina.html`). Mantemos para
    consistência visual e poderão ser alterados pelo painel admin sem
    nova migration.
  - Oficinas já cadastradas recebem uma `AssinaturaOficina` no plano que
    estavam usando (`Oficina.plano_atual`) com status 'ativa' e validade
    de 30 dias — assim ninguém é bloqueado por falta de cobrança ao subir
    a feature. A próxima renovação seguirá o fluxo normal de pagamento.
"""
from django.db import migrations
from django.utils import timezone


PLANOS_SEED = [
    {
        "codigo": "basico",
        "nome": "Básico",
        "descricao": "Plano inicial para oficinas com volume moderado de OS.",
        "preco_centavos": 9900,           # R$ 99,00/mês
        "limite_usuarios": 1,
        "limite_os_mensal": 100,
        "destaque": False,
        "ativo": True,
        "ordem": 1,
    },
    {
        "codigo": "premium",
        "nome": "Premium",
        "descricao": "OS ilimitadas, mais usuários e canais adicionais.",
        "preco_centavos": 19900,          # R$ 199,00/mês
        "limite_usuarios": 5,
        "limite_os_mensal": 0,            # 0 = ilimitado
        "destaque": True,
        "ativo": True,
        "ordem": 2,
    },
]

VALIDADE_INICIAL_DIAS = 30


def aplicar_seed(apps, schema_editor):
    PlanoSaaS = apps.get_model("modulo_pagamentos", "PlanoSaaS")
    AssinaturaOficina = apps.get_model("modulo_pagamentos", "AssinaturaOficina")
    Oficina = apps.get_model("modulo_oficina", "Oficina")

    # 1) Catálogo de planos (idempotente via update_or_create por código).
    planos_por_codigo = {}
    for item in PLANOS_SEED:
        plano, _ = PlanoSaaS.objects.update_or_create(
            codigo=item["codigo"],
            defaults={
                "nome": item["nome"],
                "descricao": item["descricao"],
                "preco_centavos": item["preco_centavos"],
                "limite_usuarios": item["limite_usuarios"],
                "limite_os_mensal": item["limite_os_mensal"],
                "destaque": item["destaque"],
                "ativo": item["ativo"],
                "ordem": item["ordem"],
            },
        )
        planos_por_codigo[item["codigo"]] = plano

    plano_fallback = planos_por_codigo.get("basico")
    if plano_fallback is None:
        return

    # 2) Cria assinatura para oficinas pré-existentes (sem sobrescrever).
    agora = timezone.now()
    expira = agora + timezone.timedelta(days=VALIDADE_INICIAL_DIAS)
    for oficina in Oficina.objects.all():
        codigo = (oficina.plano_atual or "basico").lower()
        plano = planos_por_codigo.get(codigo, plano_fallback)
        AssinaturaOficina.objects.get_or_create(
            oficina=oficina,
            defaults={
                "plano": plano,
                "status": "ativa",
                "inicio_em": agora,
                "expira_em": expira,
            },
        )


def reverter_seed(apps, schema_editor):
    """Reverte data migration removendo assinaturas e planos semeados.

    AssinaturaOficina é removida antes para liberar PROTECT no plano.
    """
    AssinaturaOficina = apps.get_model("modulo_pagamentos", "AssinaturaOficina")
    PlanoSaaS = apps.get_model("modulo_pagamentos", "PlanoSaaS")
    codigos = [item["codigo"] for item in PLANOS_SEED]
    AssinaturaOficina.objects.filter(plano__codigo__in=codigos).delete()
    PlanoSaaS.objects.filter(codigo__in=codigos).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("modulo_pagamentos", "0001_initial"),
        ("modulo_oficina", "0006_oficina_limites_override"),
    ]

    operations = [
        migrations.RunPython(aplicar_seed, reverter_seed),
    ]
