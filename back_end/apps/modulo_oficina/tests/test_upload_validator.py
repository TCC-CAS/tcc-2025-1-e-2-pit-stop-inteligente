"""Testes do validador de uploads (tamanho + MIME + extensão)."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.modulo_adm.services.configuracoes_service import (
    aplicar_seed_inicial,
    atualizar_configuracao,
    invalidar_cache,
)
from apps.modulo_oficina.models import (
    Cliente,
    Funcionario,
    Oficina,
    OrdemServico,
    Veiculo,
)
from apps.modulo_oficina.services.upload_validator import (
    obter_regras,
    validar_arquivo,
    validar_batch,
)


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _seed_e_cache():
    aplicar_seed_inicial()
    invalidar_cache()
    yield
    invalidar_cache()


@pytest.fixture
def rf_admin(db):
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIRequestFactory
    User = get_user_model()
    adm = User.objects.create_user(
        username="adm-upload", email="adm-upload@x.com", password="x",
        is_staff=True, is_superuser=True,
    )
    rf = APIRequestFactory()
    req = rf.post("/api/admin/configuracoes/")
    req.user = adm
    return req


def _arquivo(nome, tamanho_bytes, mime):
    return SimpleUploadedFile(nome, b"x" * tamanho_bytes, content_type=mime)


# ---------------------------------------------------------------------------
# Unitários — regras e validações
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_regras_default_aceitam_pdf_e_imagens():
    r = obter_regras()
    assert r.tamanho_max_mb == 10
    assert "application/pdf" in r.mimes_permitidos
    assert "image/jpeg" in r.mimes_permitidos
    assert "pdf" in r.extensoes_permitidas


@pytest.mark.unit
def test_arquivo_dentro_do_limite_passa():
    arq = _arquivo("foto.png", 500 * 1024, "image/png")
    validar_arquivo(arq)  # não deve levantar


@pytest.mark.unit
def test_arquivo_acima_do_limite_falha(rf_admin):
    # Reduz o limite para 1 MB
    atualizar_configuracao(rf_admin, "upload_os_tamanho_max_mb", 1)
    arq = _arquivo("video.png", 2 * 1024 * 1024, "image/png")
    with pytest.raises(ValueError, match="excede o limite"):
        validar_arquivo(arq)


@pytest.mark.unit
def test_mime_nao_permitido_falha():
    arq = _arquivo("malware.exe", 1024, "application/x-msdownload")
    with pytest.raises(ValueError, match="não é aceito"):
        validar_arquivo(arq)


@pytest.mark.unit
def test_extensao_nao_permitida_falha():
    """Mesmo com MIME válido, extensão estranha deve ser barrada."""
    # `application/pdf` está nos MIMEs aceitos, mas `.exe` não está nas extensões
    arq = _arquivo("disfarce.exe", 1024, "application/pdf")
    with pytest.raises(ValueError, match="Extensão"):
        validar_arquivo(arq)


@pytest.mark.unit
def test_lista_vazia_aceita_qualquer(rf_admin):
    """Configurar lista vazia desabilita o filtro daquela camada."""
    atualizar_configuracao(rf_admin, "upload_os_tipos_permitidos", [])
    atualizar_configuracao(rf_admin, "upload_os_extensoes_permitidas", [])
    arq = _arquivo("qualquer.xyz", 1024, "application/octet-stream")
    validar_arquivo(arq)  # passa porque os dois filtros estão vazios


@pytest.mark.unit
def test_validar_batch_aborta_no_primeiro_invalido():
    """Se um arquivo do batch é inválido, levanta ANTES de gravar qualquer."""
    arqs = [
        _arquivo("ok.pdf", 1024, "application/pdf"),
        _arquivo("ruim.exe", 1024, "application/x-msdownload"),
    ]
    with pytest.raises(ValueError):
        validar_batch(arqs)


# ---------------------------------------------------------------------------
# Integração — endpoint /api/oficina/upload-os/regras/
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_oficina(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    of = Oficina.objects.create(nome="OFup", cnpj="00000000000501", plano_atual="basico")
    user = User.objects.create_user(
        username="adm-upl@x.com", email="adm-upl@x.com", password="senha-forte-123",
    )
    Funcionario.objects.create(user=user, oficina=of, permissao="admin")
    return of, user


@pytest.fixture
def client_logado(admin_oficina):
    of, user = admin_oficina
    c = APIClient()
    assert c.login(username="adm-upl@x.com", password="senha-forte-123")
    s = c.session
    s["oficina_id"] = of.id
    s.save()
    return c, of


@pytest.mark.integration
def test_endpoint_regras_retorna_payload_esperado(client_logado):
    client, _ = client_logado
    resp = client.get("/api/oficina/upload-os/regras/")
    assert resp.status_code == 200
    body = resp.json()
    assert "tamanho_max_mb" in body
    assert "tamanho_max_bytes" in body
    assert "mimes_permitidos" in body
    assert "extensoes_permitidas" in body
    assert body["tamanho_max_bytes"] == body["tamanho_max_mb"] * 1024 * 1024


# ---------------------------------------------------------------------------
# Integração — upload é bloqueado no endpoint real
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_upload_arquivo_invalido_retorna_400(client_logado, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    client, of = client_logado

    # Cria uma OS
    c = Cliente.objects.create(oficina=of, nome="c", cpf_cnpj="99988877766")
    v = Veiculo.objects.create(cliente=c, placa="AAA1A12", modelo="X")
    os_obj = OrdemServico.objects.create(oficina=of, cliente=c, veiculo=v)

    arq = SimpleUploadedFile("malware.exe", b"x" * 100, content_type="application/x-msdownload")
    resp = client.post(
        f"/api/oficina/os/{os_obj.id}/documentos/upload/",
        {"files": arq},
        format="multipart",
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["arquivo_invalido"] is True
    assert "não é aceito" in body["erro"]


@pytest.mark.integration
def test_upload_arquivo_grande_retorna_400(client_logado, rf_admin, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    client, of = client_logado

    # Reduz o limite para 1 MB
    atualizar_configuracao(rf_admin, "upload_os_tamanho_max_mb", 1)

    c = Cliente.objects.create(oficina=of, nome="c", cpf_cnpj="99988877767")
    v = Veiculo.objects.create(cliente=c, placa="AAA1A13", modelo="X")
    os_obj = OrdemServico.objects.create(oficina=of, cliente=c, veiculo=v)

    # Arquivo PDF "válido" mas com 2 MB → estoura o tamanho
    arq = SimpleUploadedFile("grande.pdf", b"x" * (2 * 1024 * 1024), content_type="application/pdf")
    resp = client.post(
        f"/api/oficina/os/{os_obj.id}/documentos/upload/",
        {"files": arq},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "excede o limite" in resp.json()["erro"]


@pytest.mark.integration
def test_upload_valido_grava_documento(client_logado, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    client, of = client_logado

    c = Cliente.objects.create(oficina=of, nome="c", cpf_cnpj="99988877768")
    v = Veiculo.objects.create(cliente=c, placa="AAA1A14", modelo="X")
    os_obj = OrdemServico.objects.create(oficina=of, cliente=c, veiculo=v)

    arq = SimpleUploadedFile("nota.pdf", b"%PDF-fake-content", content_type="application/pdf")
    resp = client.post(
        f"/api/oficina/os/{os_obj.id}/documentos/upload/",
        {"files": arq},
        format="multipart",
    )
    assert resp.status_code == 201
    assert len(resp.json()) == 1
