"""Schema migration: tabela RegistroCadastroIP (controle anti-abuso).

Cria a tabela que registra cada cadastro publico de oficina por IP/UA.
O service `registrar_oficina_completa` consulta essa tabela para impedir
multiplas contas a partir do mesmo endereco em curto intervalo.
"""
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("modulo_oficina", "0006_oficina_limites_override"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RegistroCadastroIP",
            fields=[
                ("id", models.AutoField(
                    auto_created=True, primary_key=True,
                    serialize=False, verbose_name="ID",
                )),
                ("ip", models.GenericIPAddressField(db_index=True)),
                ("user_agent", models.CharField(blank=True, max_length=400)),
                ("criado_em", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("oficina", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=models.deletion.SET_NULL,
                    related_name="registros_ip",
                    to="modulo_oficina.oficina",
                )),
                ("user", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=models.deletion.SET_NULL,
                    related_name="registros_ip",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "verbose_name": "Registro de cadastro por IP",
                "verbose_name_plural": "Registros de cadastro por IP",
                "db_table": "registro_cadastro_ip",
                "ordering": ("-criado_em",),
                "indexes": [
                    models.Index(
                        fields=("ip", "-criado_em"),
                        name="registro_cad_ip_e1c1_idx",
                    ),
                ],
            },
        ),
    ]
