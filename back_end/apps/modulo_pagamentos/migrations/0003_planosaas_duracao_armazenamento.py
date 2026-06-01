"""Schema migration: adiciona `duracao_dias` e `limite_armazenamento_mb`
ao PlanoSaaS.

Justificativa:
  - `duracao_dias` permite que cada plano controle quanto tempo uma
    vigência paga estende a assinatura. Assinaturas pagas mensais
    continuam em 30 dias (default), e o plano "Teste" usa 7 dias.
  - `limite_armazenamento_mb` substitui a leitura indireta via flag global
    `limite_storage_mb_<plano>`, deixando o limite explícito na linha do
    plano. O fallback para a flag global continua existindo no
    `consumo_service` para preservar customizações já cadastradas.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("modulo_pagamentos", "0002_seed_planos_default"),
    ]

    operations = [
        migrations.AddField(
            model_name="planosaas",
            name="duracao_dias",
            field=models.PositiveIntegerField(
                default=30,
                help_text=(
                    "Duração de uma vigência da assinatura, em dias. "
                    "30 para planos mensais; 7 para o plano Teste de avaliação."
                ),
            ),
        ),
        migrations.AddField(
            model_name="planosaas",
            name="limite_armazenamento_mb",
            field=models.PositiveIntegerField(
                default=0,
                help_text=(
                    "Quota de armazenamento em MB (0 = sem limite específico, "
                    "cai no default global). Ex.: 1024 = 1 GB."
                ),
            ),
        ),
    ]
