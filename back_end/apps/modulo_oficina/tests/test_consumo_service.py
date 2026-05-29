"""Testes do service de consumo SaaS (usuários, OS/mês, storage)."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.modulo_adm.services.configuracoes_service import (
    aplicar_seed_inicial,
    atualizar_configuracao,
    invalidar_cache,
)
from apps.modulo_oficina.models import (
    Cliente,
    Documento,
    Funcionario,
    Oficina,
    OrdemServico,
    Veiculo,
)
from apps.modulo_oficina.services.consumo_service import (
    assegurar_pode_criar_os,
    assegurar_pode_upload,
    consumo_oficina,
    consumo_os_mes,
    consumo_storage,
    consumo_usuarios,
)


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _seed_e_cache():
    aplicar_seed_inicial()
    invalidar_cache()
    yield
    invalidar_cache()


@pytest.fixture
def oficina_basica(db):
    return Oficina.objects.create(
        nome="OFconsumo", cnpj="00000000000301", plano_atual="basico",
    )


@pytest.fixture
def cliente_veiculo(db, oficina_basica):
    c = Cliente.objects.create(
        oficina=oficina_basica, nome="C", cpf_cnpj="11122233344",
    )
    v = Veiculo.objects.create(cliente=c, placa="AAA1A11", modelo="X")
    return c, v


@pytest.fixture
def rf_admin(db):
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIRequestFactory
    User = get_user_model()
    adm = User.objects.create_user(
        username="adm-consumo", email="adm-consumo@x.com", password="x",
        is_staff=True, is_superuser=True,
    )
    rf = APIRequestFactory()
    req = rf.post("/api/admin/configuracoes/")
    req.user = adm
    return req


# ---------------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_consumo_usuarios_oficina_vazia(oficina_basica):
    r = consumo_usuarios(oficina_basica)
    assert r.usado == 0
    assert r.limite == 5  # plano básico (seed)
    assert r.percentual_uso == 0.0
    assert r.atingiu_limite is False


@pytest.mark.unit
def test_consumo_usuarios_conta_apenas_ativos(oficina_basica):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    for i in range(3):
        u = User.objects.create_user(username=f"u{i}@x.com", email=f"u{i}@x.com", password="x")
        Funcionario.objects.create(user=u, oficina=oficina_basica, permissao="mecanico")
    # Cria também um inativo — não pode contar
    u_off = User.objects.create_user(username="off@x.com", email="off@x.com", password="x")
    Funcionario.objects.create(
        user=u_off, oficina=oficina_basica, permissao="mecanico", is_active=False,
    )
    r = consumo_usuarios(oficina_basica)
    assert r.usado == 3


# ---------------------------------------------------------------------------
# OS mensal
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_consumo_os_mes_conta_apenas_mes_corrente(oficina_basica, cliente_veiculo):
    cli, vei = cliente_veiculo
    agora = timezone.now()
    # 2 OS no mês atual
    OrdemServico.objects.create(oficina=oficina_basica, cliente=cli, veiculo=vei)
    OrdemServico.objects.create(oficina=oficina_basica, cliente=cli, veiculo=vei)
    # 1 OS no mês anterior — não deve contar
    velha = OrdemServico.objects.create(oficina=oficina_basica, cliente=cli, veiculo=vei)
    OrdemServico.objects.filter(id=velha.id).update(
        criado_em=agora - timedelta(days=45),
    )

    r = consumo_os_mes(oficina_basica)
    assert r.usado == 2
    assert r.limite == 100


@pytest.mark.unit
def test_assegurar_pode_criar_os_bloqueia_quando_estoura(oficina_basica, cliente_veiculo, rf_admin):
    cli, vei = cliente_veiculo
    # Reduz limite para 2 para o teste rodar rápido
    atualizar_configuracao(rf_admin, "limite_os_mensal_basico", 2)
    OrdemServico.objects.create(oficina=oficina_basica, cliente=cli, veiculo=vei)
    OrdemServico.objects.create(oficina=oficina_basica, cliente=cli, veiculo=vei)
    with pytest.raises(ValueError, match="Limite mensal"):
        assegurar_pode_criar_os(oficina_basica)


@pytest.mark.unit
def test_bloqueio_de_os_pode_ser_desativado_globalmente(
    oficina_basica, cliente_veiculo, rf_admin,
):
    cli, vei = cliente_veiculo
    atualizar_configuracao(rf_admin, "limite_os_mensal_basico", 1)
    atualizar_configuracao(rf_admin, "bloquear_ao_atingir_limite_os", False)
    OrdemServico.objects.create(oficina=oficina_basica, cliente=cli, veiculo=vei)
    # Mesmo com a quota estourada (1/1), não deve levantar
    assegurar_pode_criar_os(oficina_basica)


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_consumo_storage_soma_arquivos(oficina_basica, cliente_veiculo, settings, tmp_path):
    """Cria 2 documentos e verifica que o storage_mb reflete a soma."""
    # Redireciona MEDIA_ROOT para tmp_path para não sujar o repo
    settings.MEDIA_ROOT = str(tmp_path)
    cli, vei = cliente_veiculo
    os_obj = OrdemServico.objects.create(oficina=oficina_basica, cliente=cli, veiculo=vei)

    # 200 KB + 100 KB = 300 KB = ~0.29 MB
    arq1 = SimpleUploadedFile("a.pdf", b"x" * (200 * 1024), content_type="application/pdf")
    arq2 = SimpleUploadedFile("b.pdf", b"y" * (100 * 1024), content_type="application/pdf")
    Documento.objects.create(os=os_obj, arquivo=arq1, nome_arquivo="a.pdf", origem="geral")
    Documento.objects.create(os=os_obj, arquivo=arq2, nome_arquivo="b.pdf", origem="geral")

    r = consumo_storage(oficina_basica)
    # Margem por causa de overhead de FS — esperamos ~0.29 MB
    assert 0.25 <= r.usado <= 0.35
    assert r.limite == 1024  # plano básico


@pytest.mark.integration
def test_assegurar_pode_upload_bloqueia_quando_estoura(
    oficina_basica, rf_admin, settings, tmp_path,
):
    settings.MEDIA_ROOT = str(tmp_path)
    # Reduz quota para 1 MB para testar
    atualizar_configuracao(rf_admin, "limite_storage_mb_basico", 1)
    # Tentar fazer upload de 2 MB de uma vez → deve bloquear
    with pytest.raises(ValueError, match="cota de armazenamento"):
        assegurar_pode_upload(oficina_basica, 2 * 1024 * 1024)


# ---------------------------------------------------------------------------
# Snapshot consolidado
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_consumo_oficina_retorna_tres_recursos(oficina_basica):
    snap = consumo_oficina(oficina_basica)
    chaves = {r["chave"] for r in snap["recursos"]}
    assert chaves == {"usuarios", "os_mensal", "storage_mb"}
    assert snap["plano"] == "basico"
    assert "calculado_em" in snap


@pytest.mark.integration
def test_proximo_do_limite_dispara_aos_80_pct(
    oficina_basica, cliente_veiculo, rf_admin,
):
    """Com limite 5 e 4 usados (=80%) o flag deve ser True."""
    cli, vei = cliente_veiculo
    atualizar_configuracao(rf_admin, "limite_os_mensal_basico", 5)
    for _ in range(4):
        OrdemServico.objects.create(oficina=oficina_basica, cliente=cli, veiculo=vei)
    r = consumo_os_mes(oficina_basica)
    assert r.percentual_uso == 80.0
    assert r.proximo_do_limite is True
    assert r.atingiu_limite is False
