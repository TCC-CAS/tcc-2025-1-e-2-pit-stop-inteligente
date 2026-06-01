"""Fixtures locais do modulo_pagamentos.

Reaproveitamos as fixtures do `modulo_oficina/tests/conftest.py` quando
faz sentido importando-as via pytest_plugins, mas mantemos aqui as
fixtures específicas do domínio de pagamentos.
"""
from datetime import time
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from django.contrib.auth import get_user_model

from apps.modulo_oficina.models import (
    Cliente,
    Funcionario,
    ItemOrcamento,
    Oficina,
    OrdemServico,
    Veiculo,
)
from apps.modulo_pagamentos.models import AssinaturaOficina, PlanoSaaS
from apps.modulo_pagamentos.services.abacatepay_client import CheckoutCriado


# ---------------------------------------------------------------------------
# Catálogo
# ---------------------------------------------------------------------------

@pytest.fixture
def planos_seed(db):
    """Garante os planos default no banco (idempotente)."""
    basico, _ = PlanoSaaS.objects.update_or_create(
        codigo="basico",
        defaults=dict(
            nome="Básico", preco_centavos=9900,
            limite_usuarios=1, limite_os_mensal=100,
            destaque=False, ativo=True, ordem=1,
        ),
    )
    premium, _ = PlanoSaaS.objects.update_or_create(
        codigo="premium",
        defaults=dict(
            nome="Premium", preco_centavos=19900,
            limite_usuarios=5, limite_os_mensal=0,
            destaque=True, ativo=True, ordem=2,
        ),
    )
    return {"basico": basico, "premium": premium}


# ---------------------------------------------------------------------------
# Identidade / oficina
# ---------------------------------------------------------------------------

@pytest.fixture
def user_admin(db):
    User = get_user_model()
    return User.objects.create_user(
        username="will-admin", email="admin@pitstop.test",
        password="senha-de-teste-123",
    )


@pytest.fixture
def oficina(db):
    return Oficina.objects.create(
        nome="Pit Stop Tests",
        cnpj="11.222.333/0001-44",
        email="tests@pitstop.test",
        telefone="(11) 4000-2000",
        especialidade="geral",
        horario_abertura=time(8, 0),
        horario_fechamento=time(18, 0),
        dias_funcionamento=["seg", "ter", "qua", "qui", "sex"],
        plano_atual="basico",
    )


@pytest.fixture
def admin_da_oficina(db, user_admin, oficina):
    return Funcionario.objects.create(
        user=user_admin, oficina=oficina, permissao="admin", is_active=True,
    )


@pytest.fixture
def api_admin(db, user_admin, oficina, admin_da_oficina):
    """APIClient com login real + oficina ativa na sessão.

    Usamos `force_login` em vez de `force_authenticate` porque o
    middleware de paywall precisa ler `request.user` resolvido pelo
    `AuthenticationMiddleware` do Django — o que só acontece quando há
    cookie de sessão de verdade. `force_authenticate` só injeta o user
    no nível do DRF, depois do middleware.
    """
    from rest_framework.test import APIClient
    c = APIClient(HTTP_HOST="localhost")
    c.force_login(user_admin)
    s = c.session
    s["oficina_atual_id"] = oficina.id
    s.save()
    return c


# ---------------------------------------------------------------------------
# OS com itens aprovados (cobrança de OS)
# ---------------------------------------------------------------------------

@pytest.fixture
def cliente(db, oficina):
    return Cliente.objects.create(
        oficina=oficina, nome="Cliente Tests",
        cpf_cnpj="111.222.333-44",
        email="cli@pitstop.test", telefone="(11) 99999-2222",
    )


@pytest.fixture
def veiculo(db, cliente):
    return Veiculo.objects.create(
        cliente=cliente, placa="TES1T23", modelo="Tester",
    )


@pytest.fixture
def os_com_aprovados(db, oficina, cliente, veiculo):
    os_obj = OrdemServico.objects.create(
        oficina=oficina, cliente=cliente, veiculo=veiculo, status="execucao",
    )
    ItemOrcamento.objects.create(
        os=os_obj, tipo="servico", nome_descricao="Serv. aprovado",
        quantidade=1, valor_unitario=Decimal("150.00"),
        status_aprovacao="aprovado",
    )
    ItemOrcamento.objects.create(
        os=os_obj, tipo="peca", nome_descricao="Peça aprovada",
        quantidade=2, valor_unitario=Decimal("75.50"),
        status_aprovacao="aprovado",
    )
    ItemOrcamento.objects.create(
        os=os_obj, tipo="servico", nome_descricao="Item pendente",
        quantidade=1, valor_unitario=Decimal("999.00"),
        status_aprovacao="pendente",
    )
    return os_obj


# ---------------------------------------------------------------------------
# Mock do AbacatePayClient (para testes que não devem chamar a rede)
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_checkout():
    """Devolve um CheckoutCriado padrão sem chamar a rede."""
    return CheckoutCriado(
        id="bill_test_42",
        url="https://app.abacatepay.com/pay/bill_test_42",
        amount_centavos=19900,
        status="PENDING",
        raw={"id": "bill_test_42", "status": "PENDING"},
    )


@pytest.fixture
def abacate_client_mock(fake_checkout):
    """MagicMock do AbacatePayClient que devolve o checkout fake."""
    m = MagicMock()
    m.is_dev_mode = True
    m.criar_checkout.return_value = fake_checkout
    return m
