"""Adiciona tipos de notificação para solicitações de recuperação de acesso.

A tela pública "Recuperar acesso" (oficina/cliente) passa a registrar uma
Notificacao no painel admin. Os novos valores ('recuperar_oficina',
'recuperar_cliente') precisam aparecer na lista de choices.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("modulo_adm", "0002_notificacao"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notificacao",
            name="tipo",
            field=models.CharField(
                choices=[
                    ("acesso_cliente", "Acesso de cliente à OS"),
                    ("reset_senha", "Pedido de redefinição de senha"),
                    ("os_aprovada", "OS aprovada pelo cliente"),
                    ("os_rejeitada", "Item rejeitado pelo cliente"),
                    ("backup", "Backup do banco"),
                    ("oficina_inativada", "Oficina inativada"),
                    ("info", "Informativo"),
                    ("recuperar_oficina", "Recuperação de acesso (oficina)"),
                    ("recuperar_cliente", "Recuperação de acesso (cliente)"),
                ],
                default="info",
                max_length=30,
            ),
        ),
    ]
