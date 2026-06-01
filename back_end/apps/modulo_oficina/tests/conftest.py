"""Fixtures compartilhadas pelos testes do modulo_oficina.

Organizadas por nível de abstração:
- Identidade (user, request_factory)
- Estrutura organizacional (oficina, funcionario)
- Domínio operacional (cliente, veiculo, ordem_servico, item_orcamento)

Todas as fixtures dependem do banco de dados via @pytest.mark.django_db
ou marcação de fixture (db / transactional_db do pytest-django).
"""
from datetime import time

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.modulo_oficina.models import (
    Cliente,
    Funcionario,
    ItemOrcamento,
    Oficina,
    OrdemServico,
    Veiculo,
)


# ---------------------------------------------------------------------------
# Identidade
# ---------------------------------------------------------------------------

@pytest.fixture
def user(db):
    """Usuário básico autenticado para testes."""
    User = get_user_model()
    return User.objects.create_user(
        username="william",
        email="william@pitstop.test",
        password="senha-de-teste-123",
        first_name="William",
        last_name="Tester",
    )


@pytest.fixture
def request_factory():
    """Factory de requisições DRF para uso em services e views."""
    return APIRequestFactory()


@pytest.fixture
def authenticated_request(request_factory, user):
    """Retorna função que cria request DRF já autenticado com o user fixture."""
    def _build(method="get", path="/", data=None, **kwargs):
        method_fn = getattr(request_factory, method.lower())
        request = method_fn(path, data, **kwargs)
        force_authenticate(request, user=user)
        # Necessário para a request manter o user em testes unitários
        request.user = user
        return request
    return _build


# ---------------------------------------------------------------------------
# Estrutura organizacional
# ---------------------------------------------------------------------------

@pytest.fixture
def oficina(db):
    """Oficina padrão usada como tenant nos testes."""
    return Oficina.objects.create(
        nome="Pit Stop Centro",
        cnpj="12.345.678/0001-99",
        email="contato@pitstop.test",
        telefone="(11) 4000-1000",
        especialidade="geral",
        horario_abertura=time(8, 0),
        horario_fechamento=time(18, 0),
        dias_funcionamento=["seg", "ter", "qua", "qui", "sex"],
        cidade="São Paulo",
        estado="SP",
        plano_atual="basico",
    )


@pytest.fixture
def funcionario(db, user, oficina):
    """Vincula o user fixture à oficina como administrador."""
    return Funcionario.objects.create(
        user=user,
        oficina=oficina,
        permissao="admin",
        is_active=True,
    )


# ---------------------------------------------------------------------------
# Domínio operacional
# ---------------------------------------------------------------------------

@pytest.fixture
def cliente(db, oficina):
    return Cliente.objects.create(
        oficina=oficina,
        nome="Maria Silva",
        cpf_cnpj="123.456.789-00",
        telefone="(11) 99999-1111",
        email="maria@cliente.test",
    )


@pytest.fixture
def veiculo(db, cliente):
    return Veiculo.objects.create(
        cliente=cliente,
        placa="ABC1D23",
        marca="Volkswagen",
        modelo="Gol",
        ano="2020",
        cor="Prata",
        tipo_uso="particular",
    )


@pytest.fixture
def ordem_servico(db, oficina, cliente, veiculo):
    return OrdemServico.objects.create(
        oficina=oficina,
        cliente=cliente,
        veiculo=veiculo,
        km_atual=50000,
        status="pendente",
    )


@pytest.fixture
def api_client(db, user, oficina, funcionario):
    """APIClient autenticado com a oficina já fixada na sessão."""
    from rest_framework.test import APIClient
    c = APIClient(HTTP_USER_AGENT="Mozilla/5.0 (test)")
    c.login(username=user.username, password="senha-de-teste-123")
    s = c.session
    s["oficina_atual_id"] = oficina.id
    s.save()
    return c


@pytest.fixture
def itens_orcamento(db, ordem_servico):
    """Cria 3 itens de orçamento (peça/serviço, todos pendentes)."""
    return [
        ItemOrcamento.objects.create(
            os=ordem_servico,
            tipo="servico",
            nome_descricao="Troca de óleo",
            quantidade=1,
            valor_unitario="120.00",
            status_aprovacao="pendente",
        ),
        ItemOrcamento.objects.create(
            os=ordem_servico,
            tipo="peca",
            nome_descricao="Filtro de ar",
            quantidade=1,
            valor_unitario="45.00",
            status_aprovacao="pendente",
        ),
        ItemOrcamento.objects.create(
            os=ordem_servico,
            tipo="servico",
            nome_descricao="Alinhamento",
            quantidade=1,
            valor_unitario="80.00",
            status_aprovacao="pendente",
        ),
    ]
