"""Seed determinístico para os testes end-to-end (Playwright).

Cria, de forma idempotente:
  - uma oficina + um usuário administrador (com assinatura ATIVA, para o
    dashboard não cair no paywall);
  - um cliente + veículo + OS com itens de orçamento PENDENTES + um código
    de acesso fixo, para os testes do portal do cliente.

Use APENAS em desenvolvimento/CI — nunca em produção.

    python manage.py seed_e2e

Credenciais/segredos criados:
    Oficina (admin): e2e-admin@pitstop.test / E2eAdmin!2024
    Portal cliente : código E2EOS123 + CPF 12345678909
"""
from datetime import time

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.modulo_cliente.models import CodigoAcessoOS
from apps.modulo_oficina.models import (
    Cliente,
    Funcionario,
    ItemOrcamento,
    Oficina,
    OrdemServico,
    Veiculo,
)


E2E_EMAIL = "e2e-admin@pitstop.test"
E2E_SENHA = "E2eAdmin!2024"
E2E_CNPJ = "11.111.111/0001-11"

# Portal do cliente (E2E)
E2E_CLIENTE_CPF = "12345678909"
E2E_OS_CODIGO = "E2EOS123"

# Superusuário do painel SaaS (E2E)
E2E_SUPER_EMAIL = "e2e-super@pitstop.test"
E2E_SUPER_SENHA = "E2eSuper!2024"


class Command(BaseCommand):
    help = "Cria dados determinísticos (oficina, admin, cliente e OS) para os testes E2E."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "seed_e2e é apenas para desenvolvimento/CI. Recusando porque "
                "DEBUG=False (provável ambiente de produção)."
            )
        User = get_user_model()

        user, _ = User.objects.get_or_create(
            username=E2E_EMAIL,
            defaults={"email": E2E_EMAIL, "first_name": "E2E", "last_name": "Admin"},
        )
        user.email = E2E_EMAIL
        user.is_active = True
        user.set_password(E2E_SENHA)
        user.save()

        # Superusuário para acessar o painel SaaS (aba Saúde, etc.).
        super_user, _ = User.objects.get_or_create(
            username=E2E_SUPER_EMAIL,
            defaults={"email": E2E_SUPER_EMAIL, "first_name": "E2E", "last_name": "Super"},
        )
        super_user.email = E2E_SUPER_EMAIL
        super_user.is_active = True
        super_user.is_staff = True
        super_user.is_superuser = True
        super_user.set_password(E2E_SUPER_SENHA)
        super_user.save()

        oficina, _ = Oficina.objects.get_or_create(
            cnpj=E2E_CNPJ,
            defaults={
                "nome": "Oficina E2E",
                "email": "contato.e2e@pitstop.test",
                "telefone": "(11) 4000-0000",
                "especialidade": "geral",
                "horario_abertura": time(8, 0),
                "horario_fechamento": time(18, 0),
                "dias_funcionamento": ["seg", "ter", "qua", "qui", "sex"],
                "cidade": "São Paulo",
                "estado": "SP",
                "plano_atual": "basico",
            },
        )

        Funcionario.objects.get_or_create(
            user=user,
            oficina=oficina,
            defaults={"permissao": "admin", "is_active": True},
        )

        self._ativar_assinatura(oficina)
        os_cliente = self._criar_os_cliente(oficina)

        self.stdout.write(self.style.SUCCESS(
            f"Seed E2E pronto. Login oficina: {E2E_EMAIL} / {E2E_SENHA} "
            f"| oficina '{oficina.nome}' (id={oficina.id})."
        ))
        self.stdout.write(self.style.SUCCESS(
            f"Portal do cliente: código '{E2E_OS_CODIGO}' + CPF {E2E_CLIENTE_CPF} "
            f"(OS #{os_cliente.id} com itens pendentes)."
        ))
        self.stdout.write(self.style.SUCCESS(
            f"Painel SaaS (superuser): {E2E_SUPER_EMAIL} / {E2E_SUPER_SENHA}."
        ))

    def _ativar_assinatura(self, oficina):
        """Deixa a assinatura vigente para o dashboard não bloquear no paywall."""
        from apps.modulo_pagamentos.models import PlanoSaaS
        from apps.modulo_pagamentos.services.assinatura_service import (
            obter_ou_criar_assinatura,
        )

        assinatura = obter_ou_criar_assinatura(oficina)
        assinatura.plano = (
            PlanoSaaS.objects.filter(codigo="basico").first() or assinatura.plano
        )
        assinatura.status = "ativa"
        assinatura.inicio_em = assinatura.inicio_em or timezone.now()
        assinatura.expira_em = timezone.now() + timezone.timedelta(days=365)
        assinatura.save()

    def _criar_os_cliente(self, oficina):
        """Cria cliente + veículo + OS com 2 itens PENDENTES + código de acesso.

        Repetível: os itens são resetados para 'pendente' a cada execução,
        pois o teste de aprovação os consome.
        """
        cliente, _ = Cliente.objects.get_or_create(
            oficina=oficina,
            cpf_cnpj=E2E_CLIENTE_CPF,
            defaults={
                "nome": "Cliente E2E",
                "telefone": "(11) 90000-0000",
                "email": "cliente.e2e@pitstop.test",
            },
        )
        veiculo, _ = Veiculo.objects.get_or_create(
            cliente=cliente,
            placa="E2E1A23",
            defaults={
                "marca": "Volkswagen",
                "modelo": "Gol",
                "ano": "2020",
                "cor": "Prata",
                "tipo_uso": "particular",
            },
        )

        os_obj = OrdemServico.objects.filter(cliente=cliente).order_by("id").first()
        if os_obj is None:
            os_obj = OrdemServico.objects.create(
                oficina=oficina, cliente=cliente, veiculo=veiculo, km_atual=50000,
            )

        itens = ItemOrcamento.objects.filter(os=os_obj)
        if itens.exists():
            # Reseta para repetir o fluxo de aprovação em execuções seguintes.
            itens.update(status_aprovacao="pendente")
        else:
            ItemOrcamento.objects.create(
                os=os_obj, tipo="servico", nome_descricao="Troca de óleo (E2E)",
                quantidade=1, valor_unitario="120.00", status_aprovacao="pendente",
            )
            ItemOrcamento.objects.create(
                os=os_obj, tipo="peca", nome_descricao="Filtro de ar (E2E)",
                quantidade=1, valor_unitario="45.00", status_aprovacao="pendente",
            )

        CodigoAcessoOS.objects.update_or_create(
            codigo=E2E_OS_CODIGO,
            defaults={
                "os": os_obj,
                "expira_em": timezone.now() + timezone.timedelta(days=30),
                "revogado": False,
                "tentativas": 0,
                "max_tentativas": 100,
            },
        )
        return os_obj
