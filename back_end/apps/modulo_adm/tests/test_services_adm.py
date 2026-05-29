"""Cobertura dos services do modulo_adm (usuarios, oficinas, os, dashboard, backup)."""
import json
import pytest
from rest_framework.test import APIRequestFactory

from apps.modulo_adm.services import (
    alterar_status_os_admin,
    listar_oficinas_com_agregados,
    inativar_oficina,
    excluir_oficina,
    criar_usuario_admin,
    atualizar_usuario_admin,
    alterar_senha_usuario,
    inativar_usuario,
    excluir_usuario,
    vincular_usuario_oficina,
    montar_dashboard_admin,
)
from apps.modulo_adm.models import AuditoriaLog, Notificacao
from apps.modulo_oficina.models import (
    Cliente,
    Funcionario,
    Oficina,
    OrdemServico,
    Veiculo,
)


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures comuns
# ---------------------------------------------------------------------------

@pytest.fixture
def rf():
    return APIRequestFactory()


@pytest.fixture
def super_admin(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(
        username="super", email="super@x.com", password="x",
        is_staff=True, is_superuser=True,
    )


@pytest.fixture
def admin_request(rf, super_admin):
    req = rf.post("/api/admin/")
    req.user = super_admin
    return req


@pytest.fixture
def usuario_comum(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(
        username="staff", email="staff@x.com", password="x", is_staff=True,
    )


@pytest.fixture
def request_staff(rf, usuario_comum):
    """request.user é staff mas NÃO superuser."""
    req = rf.post("/api/admin/")
    req.user = usuario_comum
    return req


@pytest.fixture
def oficina(db):
    return Oficina.objects.create(nome="Of A", cnpj="11111111111111", plano_atual="basico")


# ---------------------------------------------------------------------------
# usuarios_service
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_criar_usuario_basico(admin_request):
    user = criar_usuario_admin(admin_request, {
        "email": "novo@x.com",
        "password": "senha-de-teste-123",
        "first_name": "Novo",
    })
    assert user.email == "novo@x.com"
    assert AuditoriaLog.objects.filter(acao="usuario.criar").count() == 1


@pytest.mark.unit
def test_criar_usuario_sem_email_falha(admin_request):
    with pytest.raises(ValueError, match="E-mail"):
        criar_usuario_admin(admin_request, {"password": "senha-de-teste-123"})


@pytest.mark.unit
def test_criar_usuario_email_duplicado_falha(admin_request, usuario_comum):
    with pytest.raises(ValueError, match="Já existe"):
        criar_usuario_admin(admin_request, {
            "email": usuario_comum.email, "password": "senha-de-teste-123",
        })


@pytest.mark.unit
def test_criar_usuario_senha_curta_falha(admin_request):
    with pytest.raises(ValueError, match="8 caracteres"):
        criar_usuario_admin(admin_request, {"email": "x@y.com", "password": "123"})


@pytest.mark.unit
def test_criar_staff_exige_superuser(request_staff):
    """Staff comum (não super) NÃO pode criar outros staff."""
    with pytest.raises(ValueError, match="Super Admin"):
        criar_usuario_admin(request_staff, {
            "email": "novostaff@x.com", "password": "senha-de-teste-123",
            "is_staff": True,
        })


@pytest.mark.unit
def test_criar_usuario_com_vinculo_de_oficina(admin_request, oficina):
    user = criar_usuario_admin(admin_request, {
        "email": "comvinc@x.com", "password": "senha-de-teste-123",
        "oficina_id": oficina.id, "permissao": "mecanico",
    })
    assert Funcionario.objects.filter(user=user, oficina=oficina).exists()


@pytest.mark.unit
def test_criar_usuario_oficina_inexistente_falha(admin_request):
    with pytest.raises(ValueError, match="Oficina"):
        criar_usuario_admin(admin_request, {
            "email": "x@y.com", "password": "senha-de-teste-123",
            "oficina_id": 99999,
        })


@pytest.mark.unit
def test_atualizar_usuario_basico(admin_request, usuario_comum):
    atualizar_usuario_admin(admin_request, usuario_comum, {
        "first_name": "Atualizado", "is_active": False,
    })
    usuario_comum.refresh_from_db()
    assert usuario_comum.first_name == "Atualizado"
    assert usuario_comum.is_active is False


@pytest.mark.unit
def test_atualizar_email_duplicado_falha(admin_request, usuario_comum):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    User.objects.create_user(username="outro@x.com", email="outro@x.com", password="x")
    with pytest.raises(ValueError, match="Já existe"):
        atualizar_usuario_admin(admin_request, usuario_comum, {"email": "outro@x.com"})


@pytest.mark.unit
def test_atualizar_is_staff_exige_superuser(request_staff, usuario_comum):
    with pytest.raises(ValueError, match="Super Admin"):
        atualizar_usuario_admin(request_staff, usuario_comum, {"is_staff": True})


@pytest.mark.unit
def test_atualizar_superuser_implica_staff(admin_request, usuario_comum):
    atualizar_usuario_admin(admin_request, usuario_comum, {"is_superuser": True})
    usuario_comum.refresh_from_db()
    assert usuario_comum.is_superuser is True
    assert usuario_comum.is_staff is True


@pytest.mark.unit
def test_alterar_senha_basico(admin_request, usuario_comum):
    senha_antiga = usuario_comum.password
    alterar_senha_usuario(admin_request, usuario_comum, "nova-senha-segura-123")
    usuario_comum.refresh_from_db()
    assert usuario_comum.password != senha_antiga
    # Cria Notificacao para a equipe
    assert Notificacao.objects.filter(tipo="reset_senha").count() == 1


@pytest.mark.unit
def test_alterar_senha_curta_falha(admin_request, usuario_comum):
    with pytest.raises(ValueError, match="8 caracteres"):
        alterar_senha_usuario(admin_request, usuario_comum, "abc")


@pytest.mark.unit
def test_inativar_usuario(admin_request, usuario_comum):
    inativar_usuario(admin_request, usuario_comum, False)
    usuario_comum.refresh_from_db()
    assert usuario_comum.is_active is False
    # Reativar
    inativar_usuario(admin_request, usuario_comum, True)
    usuario_comum.refresh_from_db()
    assert usuario_comum.is_active is True


@pytest.mark.unit
def test_excluir_usuario_proibido_a_si_mesmo(admin_request, super_admin):
    """request.user.id == user.id → bloqueia."""
    with pytest.raises(ValueError, match="a si mesmo"):
        excluir_usuario(admin_request, super_admin)


@pytest.mark.unit
def test_excluir_superuser_exige_superuser(request_staff, super_admin):
    with pytest.raises(ValueError, match="Super Admin"):
        excluir_usuario(request_staff, super_admin)


@pytest.mark.unit
def test_excluir_usuario_basico(admin_request, usuario_comum):
    pk = usuario_comum.id
    excluir_usuario(admin_request, usuario_comum)
    from django.contrib.auth import get_user_model
    User = get_user_model()
    assert not User.objects.filter(pk=pk).exists()


@pytest.mark.unit
def test_vincular_usuario_oficina(admin_request, usuario_comum, oficina):
    func = vincular_usuario_oficina(
        admin_request, usuario_comum, oficina.id, "atendente",
    )
    assert func.permissao == "atendente"
    assert func.is_active is True


@pytest.mark.unit
def test_vincular_atualiza_existente(admin_request, usuario_comum, oficina):
    Funcionario.objects.create(user=usuario_comum, oficina=oficina, permissao="visualizador")
    func = vincular_usuario_oficina(admin_request, usuario_comum, oficina.id, "mecanico")
    assert func.permissao == "mecanico"


@pytest.mark.unit
def test_vincular_oficina_inexistente_falha(admin_request, usuario_comum):
    with pytest.raises(ValueError, match="Oficina"):
        vincular_usuario_oficina(admin_request, usuario_comum, 99999, "admin")


# ---------------------------------------------------------------------------
# oficinas_service
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_listar_oficinas_com_agregados(oficina):
    qs = listar_oficinas_com_agregados()
    assert qs.count() >= 1
    item = qs.get(id=oficina.id)
    assert item.total_funcionarios == 0
    assert item.total_clientes == 0


@pytest.mark.unit
def test_listar_oficinas_com_filtros(oficina):
    Oficina.objects.create(nome="Premium X", cnpj="22222222222222", plano_atual="premium", estado="SP")

    assert listar_oficinas_com_agregados(plano="premium").count() == 1
    assert listar_oficinas_com_agregados(estado="SP").count() == 1
    assert listar_oficinas_com_agregados(busca="Premium").count() == 1


@pytest.mark.unit
def test_inativar_oficina_marca_funcionarios(admin_request, oficina, usuario_comum):
    Funcionario.objects.create(user=usuario_comum, oficina=oficina, permissao="mecanico")
    inativar_oficina(admin_request, oficina, False)
    assert Funcionario.objects.filter(oficina=oficina, is_active=True).count() == 0


@pytest.mark.unit
def test_excluir_oficina_remove_e_audita(admin_request, oficina):
    pk = oficina.id
    excluir_oficina(admin_request, oficina)
    assert not Oficina.objects.filter(pk=pk).exists()
    assert AuditoriaLog.objects.filter(acao="oficina.excluir").count() == 1


# ---------------------------------------------------------------------------
# os_service (admin)
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_alterar_status_admin_validacoes(admin_request, oficina):
    c = Cliente.objects.create(oficina=oficina, nome="C", cpf_cnpj="11122233344")
    v = Veiculo.objects.create(cliente=c, placa="AAA1A11", modelo="X")
    os_obj = OrdemServico.objects.create(oficina=oficina, cliente=c, veiculo=v)

    # status inválido
    with pytest.raises(ValueError, match="Status"):
        alterar_status_os_admin(admin_request, os_obj, "invalido", "motivo")
    # motivo obrigatório
    with pytest.raises(ValueError, match="motivo"):
        alterar_status_os_admin(admin_request, os_obj, "execucao", "")


@pytest.mark.unit
def test_alterar_status_admin_idempotente(admin_request, oficina):
    c = Cliente.objects.create(oficina=oficina, nome="C", cpf_cnpj="11122233344")
    v = Veiculo.objects.create(cliente=c, placa="AAA1A11", modelo="X")
    os_obj = OrdemServico.objects.create(oficina=oficina, cliente=c, veiculo=v, status="pendente")
    # Já está no status alvo — não muda nada nem registra auditoria
    antes_audits = AuditoriaLog.objects.filter(acao="os.alterar_status").count()
    alterar_status_os_admin(admin_request, os_obj, "pendente", "motivo qualquer")
    depois_audits = AuditoriaLog.objects.filter(acao="os.alterar_status").count()
    assert depois_audits == antes_audits


@pytest.mark.unit
def test_alterar_status_admin_registra_auditoria_e_historico(admin_request, oficina):
    c = Cliente.objects.create(oficina=oficina, nome="C", cpf_cnpj="11122233344")
    v = Veiculo.objects.create(cliente=c, placa="AAA1A11", modelo="X")
    os_obj = OrdemServico.objects.create(oficina=oficina, cliente=c, veiculo=v, status="pendente")
    alterar_status_os_admin(admin_request, os_obj, "execucao", "decisão administrativa")
    os_obj.refresh_from_db()
    assert os_obj.status == "execucao"
    assert AuditoriaLog.objects.filter(acao="os.alterar_status").count() == 1
    # E o histórico interno da OS recebeu uma entrada de status
    assert os_obj.historico.filter(tipo="status").count() == 1


# ---------------------------------------------------------------------------
# dashboard_service
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_montar_dashboard_admin_estrutura():
    snap = montar_dashboard_admin()
    assert "kpis" in snap
    assert "os_status_distribuicao" in snap
    assert "os_por_dia" in snap
    assert "top_oficinas" in snap
    assert "funcionarios_por_papel" in snap
    assert "eventos_recentes" in snap
    # kpis principais
    assert snap["kpis"]["total_oficinas"] >= 0
    assert "taxa_conclusao" in snap["kpis"]


@pytest.mark.integration
def test_montar_dashboard_kpis_calculados(oficina):
    c = Cliente.objects.create(oficina=oficina, nome="C", cpf_cnpj="11122233344")
    v = Veiculo.objects.create(cliente=c, placa="AAA1A11", modelo="X")
    OrdemServico.objects.create(oficina=oficina, cliente=c, veiculo=v, status="concluido")
    OrdemServico.objects.create(oficina=oficina, cliente=c, veiculo=v, status="pendente")

    snap = montar_dashboard_admin()
    assert snap["kpis"]["total_os"] == 2
    assert snap["kpis"]["os_concluidas"] == 1
    assert snap["kpis"]["os_pendentes"] == 1
    assert snap["kpis"]["taxa_conclusao"] == 50.0
