"""Cobertura dos services do modulo_cliente (auth, aprovação, checklist)."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from apps.modulo_cliente.models import CodigoAcessoOS
from apps.modulo_cliente.services.auth_service import (
    autenticar_cliente,
    encerrar_sessao_cliente,
)
from apps.modulo_cliente.services.aprovacao_service import (
    aprovar_orcamento_cliente,
    atualizar_status_item_cliente,
)
from apps.modulo_cliente.services.checklist_service import (
    assinar_checklist_cliente,
)
from apps.modulo_cliente.utils import (
    somente_digitos,
    get_cliente_atual,
    registrar_evento_cliente,
)
from apps.modulo_cliente.permissions import SESSION_CLIENTE_KEY
from apps.modulo_oficina.models import (
    ChecklistRecebimento,
    Cliente,
    HistoricoOS,
    ItemOrcamento,
    Oficina,
    OrdemServico,
    TarefaExecucao,
    Veiculo,
)


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def oficina(db):
    return Oficina.objects.create(nome="Of", cnpj="11122233344455", plano_atual="basico")


@pytest.fixture
def cliente(db, oficina):
    return Cliente.objects.create(
        oficina=oficina, nome="João Silva", cpf_cnpj="11122233344",
    )


@pytest.fixture
def os_obj(db, oficina, cliente):
    v = Veiculo.objects.create(cliente=cliente, placa="AAA1A11", modelo="X")
    return OrdemServico.objects.create(oficina=oficina, cliente=cliente, veiculo=v)


@pytest.fixture
def codigo_valido(db, os_obj):
    return CodigoAcessoOS.gerar(os_obj)


@pytest.fixture
def request_factory():
    return APIRequestFactory()


@pytest.fixture
def request_com_sessao(request_factory):
    """Cria uma request com sessão real do Django."""
    from django.contrib.sessions.backends.db import SessionStore
    req = request_factory.post("/api/cliente/")
    req.session = SessionStore()
    req.META["HTTP_USER_AGENT"] = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"
    )
    req.META["REMOTE_ADDR"] = "127.0.0.1"
    return req


# ---------------------------------------------------------------------------
# utils
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_somente_digitos_remove_tudo_que_nao_eh_numero():
    assert somente_digitos("123.456.789-00") == "12345678900"
    assert somente_digitos("  abc ") == ""
    assert somente_digitos(None) == ""


@pytest.mark.unit
def test_get_cliente_atual_retorna_none_quando_sessao_vazia(request_com_sessao):
    assert get_cliente_atual(request_com_sessao) is None


@pytest.mark.unit
def test_get_cliente_atual_retorna_cliente_da_sessao(request_com_sessao, cliente):
    request_com_sessao.session[SESSION_CLIENTE_KEY] = cliente.id
    obtido = get_cliente_atual(request_com_sessao)
    assert obtido is not None
    assert obtido.id == cliente.id


@pytest.mark.unit
def test_registrar_evento_cliente_cria_historico_anonimo(os_obj):
    h = registrar_evento_cliente(os_obj, "checklist", "Cliente fez algo", "detalhe")
    assert h.usuario is None
    assert "portal do cliente" in h.detalhes.lower()


@pytest.mark.unit
def test_registrar_evento_cliente_sem_detalhes():
    """Cobre o branch quando detalhes é vazio."""
    ofic = Oficina.objects.create(nome="Y", cnpj="00000000000001", plano_atual="basico")
    cli = Cliente.objects.create(oficina=ofic, nome="Z", cpf_cnpj="12345678901")
    v = Veiculo.objects.create(cliente=cli, placa="ZZZ9Z99", modelo="Q")
    os_obj = OrdemServico.objects.create(oficina=ofic, cliente=cli, veiculo=v)
    h = registrar_evento_cliente(os_obj, "checklist", "sem detalhe", "")
    assert "portal do cliente" in h.detalhes.lower()


# ---------------------------------------------------------------------------
# auth_service
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_autenticar_cliente_com_codigo_valido(request_com_sessao, codigo_valido, cliente, os_obj):
    payload = autenticar_cliente(
        request_com_sessao,
        cpf_cnpj=cliente.cpf_cnpj,
        codigo=codigo_valido.codigo,
    )
    assert payload["cliente"]["id"] == cliente.id
    assert payload["os_inicial_id"] == os_obj.id


@pytest.mark.unit
def test_autenticar_cliente_cpf_invalido_falha(request_com_sessao):
    with pytest.raises(ValueError, match="CPF"):
        autenticar_cliente(request_com_sessao, cpf_cnpj="abc")


@pytest.mark.unit
def test_autenticar_cliente_codigo_inexistente(request_com_sessao):
    with pytest.raises(ValueError, match="Código"):
        autenticar_cliente(
            request_com_sessao, cpf_cnpj="11122233344", codigo="ZZZZZZZZ",
        )


@pytest.mark.unit
def test_autenticar_cliente_codigo_revogado(request_com_sessao, codigo_valido, cliente):
    codigo_valido.revogar()
    with pytest.raises(ValueError, match="revogado"):
        autenticar_cliente(
            request_com_sessao, cpf_cnpj=cliente.cpf_cnpj,
            codigo=codigo_valido.codigo,
        )


@pytest.mark.unit
def test_autenticar_cliente_codigo_expirado(request_com_sessao, codigo_valido, cliente):
    codigo_valido.expira_em = timezone.now() - timedelta(days=1)
    codigo_valido.save(update_fields=["expira_em"])
    with pytest.raises(ValueError, match="expirou"):
        autenticar_cliente(
            request_com_sessao, cpf_cnpj=cliente.cpf_cnpj,
            codigo=codigo_valido.codigo,
        )


@pytest.mark.unit
def test_autenticar_cliente_codigo_bloqueado_por_tentativas(request_com_sessao, codigo_valido, cliente):
    codigo_valido.tentativas = codigo_valido.max_tentativas
    codigo_valido.save(update_fields=["tentativas"])
    with pytest.raises(ValueError, match="Excedidas|tentativas"):
        autenticar_cliente(
            request_com_sessao, cpf_cnpj=cliente.cpf_cnpj,
            codigo=codigo_valido.codigo,
        )


@pytest.mark.unit
def test_autenticar_cliente_cpf_errado_consome_tentativa(request_com_sessao, codigo_valido):
    """CPF errado registra tentativa falha e devolve mensagem com restantes."""
    with pytest.raises(ValueError, match="não conferem"):
        autenticar_cliente(
            request_com_sessao, cpf_cnpj="99988877766",  # outro CPF
            codigo=codigo_valido.codigo,
        )
    codigo_valido.refresh_from_db()
    assert codigo_valido.tentativas == 1


@pytest.mark.integration
def test_autenticar_cliente_por_numero_os_legado(request_com_sessao, os_obj, cliente):
    payload = autenticar_cliente(
        request_com_sessao,
        cpf_cnpj=cliente.cpf_cnpj,
        numero_os=os_obj.id,
    )
    assert payload["os_inicial_id"] == os_obj.id


@pytest.mark.unit
def test_autenticar_cliente_numero_os_invalido(request_com_sessao, cliente):
    with pytest.raises(ValueError, match="número de OS"):
        autenticar_cliente(
            request_com_sessao, cpf_cnpj=cliente.cpf_cnpj, numero_os="abc",
        )


@pytest.mark.unit
def test_autenticar_cliente_os_nao_encontrada(request_com_sessao, cliente):
    with pytest.raises(ValueError, match="não encontramos|encontramos"):
        autenticar_cliente(
            request_com_sessao, cpf_cnpj=cliente.cpf_cnpj, numero_os=99999,
        )


@pytest.mark.unit
def test_autenticar_cliente_numero_os_cpf_nao_confere(request_com_sessao, os_obj):
    with pytest.raises(ValueError, match="não conferem"):
        autenticar_cliente(
            request_com_sessao, cpf_cnpj="99988877766", numero_os=os_obj.id,
        )


@pytest.mark.unit
def test_autenticar_cliente_sem_codigo_nem_numero_os(request_com_sessao, cliente):
    with pytest.raises(ValueError, match="código"):
        autenticar_cliente(request_com_sessao, cpf_cnpj=cliente.cpf_cnpj)


@pytest.mark.integration
def test_autenticar_cliente_rejeita_honeypot(request_com_sessao, cliente, codigo_valido):
    request_com_sessao.data = {"url_optional": "spam"}
    with pytest.raises(ValueError, match="recusado"):
        autenticar_cliente(
            request_com_sessao, cpf_cnpj=cliente.cpf_cnpj,
            codigo=codigo_valido.codigo,
        )


@pytest.mark.unit
def test_encerrar_sessao_cliente_limpa_chave(request_com_sessao):
    request_com_sessao.session[SESSION_CLIENTE_KEY] = 99
    encerrar_sessao_cliente(request_com_sessao)
    assert SESSION_CLIENTE_KEY not in request_com_sessao.session


# ---------------------------------------------------------------------------
# aprovacao_service
# ---------------------------------------------------------------------------

@pytest.fixture
def item_orcamento(db, os_obj):
    return ItemOrcamento.objects.create(
        os=os_obj, tipo="servico", nome_descricao="Troca de óleo",
        quantidade=1, valor_unitario=Decimal("180.00"),
    )


@pytest.mark.unit
def test_atualizar_status_item_aprovado_cria_tarefa(os_obj, item_orcamento):
    atualizar_status_item_cliente(os_obj, item_orcamento.id, "aprovado")
    item_orcamento.refresh_from_db()
    assert item_orcamento.status_aprovacao == "aprovado"
    assert TarefaExecucao.objects.filter(os=os_obj).count() == 1


@pytest.mark.unit
def test_atualizar_status_item_reprovado(os_obj, item_orcamento):
    atualizar_status_item_cliente(
        os_obj, item_orcamento.id, "reprovado", justificativa="muito caro",
    )
    item_orcamento.refresh_from_db()
    assert item_orcamento.status_aprovacao == "reprovado"
    # Não cria tarefa quando reprovado
    assert TarefaExecucao.objects.filter(os=os_obj).count() == 0


@pytest.mark.unit
def test_atualizar_status_invalido_falha(os_obj, item_orcamento):
    with pytest.raises(ValueError, match="aprovado|reprovado"):
        atualizar_status_item_cliente(os_obj, item_orcamento.id, "ruim")


@pytest.mark.unit
def test_atualizar_status_item_inexistente_falha(os_obj):
    with pytest.raises(ValueError, match="não encontrado"):
        atualizar_status_item_cliente(os_obj, 99999, "aprovado")


@pytest.mark.unit
def test_atualizar_status_eh_idempotente(os_obj, item_orcamento):
    item_orcamento.status_aprovacao = "aprovado"
    item_orcamento.save()
    atualizar_status_item_cliente(os_obj, item_orcamento.id, "aprovado")
    # Não cria tarefa nova
    assert TarefaExecucao.objects.filter(os=os_obj).count() == 0


@pytest.mark.unit
def test_aprovar_orcamento_lote(os_obj, item_orcamento):
    """Aprova um item e rejeita outro em um único batch."""
    outro = ItemOrcamento.objects.create(
        os=os_obj, tipo="peca", nome_descricao="Filtro de óleo",
        quantidade=1, valor_unitario=Decimal("30.00"),
    )
    resultado = aprovar_orcamento_cliente(
        os_obj,
        itens_payload=[
            {"id": item_orcamento.id, "status": "aprovado"},
            {"id": outro.id, "status": "reprovado"},
        ],
        termo_aceito=True,
    )
    assert resultado["aprovados"] == 1
    assert resultado["rejeitados"] == 1
    os_obj.refresh_from_db()
    assert os_obj.status == "execucao"  # Pelo menos um aprovado → OS vai para execução


@pytest.mark.unit
def test_aprovar_orcamento_sem_termo_falha(os_obj, item_orcamento):
    with pytest.raises(ValueError, match="termo"):
        aprovar_orcamento_cliente(
            os_obj,
            itens_payload=[{"id": item_orcamento.id, "status": "aprovado"}],
            termo_aceito=False,
        )


@pytest.mark.unit
def test_aprovar_orcamento_lista_vazia_falha(os_obj):
    with pytest.raises(ValueError, match="ao menos|item"):
        aprovar_orcamento_cliente(os_obj, itens_payload=[], termo_aceito=True)


@pytest.mark.unit
def test_aprovar_orcamento_status_invalido_ignorado(os_obj, item_orcamento):
    """Item com status inválido é simplesmente ignorado (não derruba a request)."""
    resultado = aprovar_orcamento_cliente(
        os_obj,
        itens_payload=[
            {"id": item_orcamento.id, "status": "ruim"},
            {"id": item_orcamento.id, "status": "aprovado"},
        ],
        termo_aceito=True,
    )
    assert resultado["aprovados"] == 1


# ---------------------------------------------------------------------------
# checklist_service
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_assinar_checklist_assinatura_vazia(os_obj):
    with pytest.raises(ValueError, match="vazia"):
        assinar_checklist_cliente(os_obj, "")


@pytest.mark.unit
def test_assinar_checklist_formato_invalido(os_obj):
    with pytest.raises(ValueError, match="Formato"):
        assinar_checklist_cliente(os_obj, "naoeumdataurl")


@pytest.mark.unit
def test_assinar_checklist_grande_demais(os_obj):
    grande = "data:image/png;base64," + ("x" * 600_000)
    with pytest.raises(ValueError, match="tamanho"):
        assinar_checklist_cliente(os_obj, grande)


@pytest.mark.unit
def test_assinar_checklist_inexistente_falha(os_obj):
    with pytest.raises(ValueError, match="ainda não|disponível"):
        assinar_checklist_cliente(os_obj, "data:image/png;base64,abc")


@pytest.mark.integration
def test_assinar_checklist_persiste(os_obj):
    ChecklistRecebimento.objects.create(os=os_obj)
    dataurl = "data:image/png;base64,iVBORw0KGgoAAAA="
    chk = assinar_checklist_cliente(os_obj, dataurl)
    assert chk.assinatura_cliente == dataurl
    assert HistoricoOS.objects.filter(os=os_obj, tipo="checklist").count() == 1
