"""Schema migration: tabela TokenConfirmacaoEmail.

Persiste tokens de confirmacao de e-mail gerados no cadastro de
oficinas. Cada token tem validade de 72 h e usa um identificador de
64 caracteres unico (gerado por secrets.token_urlsafe).
"""
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("modulo_oficina", "0007_registro_cadastro_ip"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="TokenConfirmacaoEmail",
            fields=[
                ("id", models.AutoField(
                    auto_created=True, primary_key=True,
                    serialize=False, verbose_name="ID",
                )),
                ("token", models.CharField(db_index=True, max_length=64, unique=True)),
                ("criado_em", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("expira_em", models.DateTimeField()),
                ("usado_em", models.DateTimeField(blank=True, null=True)),
                ("enviado_para", models.EmailField(blank=True, max_length=254)),
                ("user", models.ForeignKey(
                    on_delete=models.deletion.CASCADE,
                    related_name="tokens_email",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "verbose_name": "Token de confirmação de e-mail",
                "verbose_name_plural": "Tokens de confirmação de e-mail",
                "db_table": "token_confirmacao_email",
                "ordering": ("-criado_em",),
            },
        ),
    ]
