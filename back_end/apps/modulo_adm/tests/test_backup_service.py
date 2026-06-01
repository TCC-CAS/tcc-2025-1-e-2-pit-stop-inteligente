"""Cobertura do service de backup/restauração."""
import io
import json
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory

from apps.modulo_adm.models import AuditoriaLog
from apps.modulo_adm.services.backup_service import (
    gerar_backup_json,
    restaurar_backup_json,
    _tamanho_bytes,
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_request():
    from django.contrib.auth import get_user_model
    User = get_user_model()
    u = User.objects.create_user(username="bk", email="bk@x.com", password="x",
                                 is_staff=True, is_superuser=True)
    rf = APIRequestFactory()
    req = rf.post("/api/admin/backup/")
    req.user = u
    return req


# ---------------------------------------------------------------------------
# Geração
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_gerar_backup_devolve_filename_e_bytesio(admin_request):
    filename, buffer = gerar_backup_json(admin_request)
    assert filename.startswith("pitstop_backup_")
    assert filename.endswith(".json")
    conteudo = buffer.read().decode("utf-8")
    dados = json.loads(conteudo)
    assert isinstance(dados, list)
    # auditoria gravada
    assert AuditoriaLog.objects.filter(acao="backup.exportar").count() == 1


# ---------------------------------------------------------------------------
# Restauração
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_restaurar_backup_arquivo_none_falha():
    with pytest.raises(ValueError, match="arquivo"):
        restaurar_backup_json(None)


@pytest.mark.integration
def test_restaurar_backup_extensao_invalida_falha():
    arq = SimpleUploadedFile("bk.txt", b"[]", content_type="text/plain")
    with pytest.raises(ValueError, match=".json"):
        restaurar_backup_json(arq)


@pytest.mark.integration
def test_restaurar_backup_json_invalido_falha():
    arq = SimpleUploadedFile("bk.json", b"{nao eh json}", content_type="application/json")
    with pytest.raises(ValueError, match="JSON"):
        restaurar_backup_json(arq)


@pytest.mark.integration
def test_restaurar_backup_vazio_falha():
    arq = SimpleUploadedFile("bk.json", b"[]", content_type="application/json")
    with pytest.raises(ValueError, match="vazio|formato"):
        restaurar_backup_json(arq)


@pytest.mark.integration
def test_restaurar_backup_modelos_desconhecidos_falha():
    payload = json.dumps([{"model": "fake.naoexiste", "pk": 1, "fields": {}}]).encode()
    arq = SimpleUploadedFile("bk.json", payload, content_type="application/json")
    with pytest.raises(ValueError, match="desconhecidos"):
        restaurar_backup_json(arq)


@pytest.mark.integration
def test_restaurar_backup_valido_aplica(admin_request):
    """Faz round-trip: gera backup → restaura → audit gravada."""
    _, buffer = gerar_backup_json(admin_request)
    conteudo = buffer.getvalue()
    arq = SimpleUploadedFile("bk.json", conteudo, content_type="application/json")
    resultado = restaurar_backup_json(arq, request=admin_request)
    assert resultado["registros_aplicados"] > 0
    assert AuditoriaLog.objects.filter(acao="backup.restaurar").count() == 1


# ---------------------------------------------------------------------------
# Helper de formatação
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_tamanho_bytes_em_b():
    assert _tamanho_bytes("abc") == "3 B"


@pytest.mark.unit
def test_tamanho_bytes_em_kb():
    s = "x" * 2048
    assert "KB" in _tamanho_bytes(s)


@pytest.mark.unit
def test_tamanho_bytes_em_mb():
    s = "x" * (2 * 1024 * 1024)
    assert "MB" in _tamanho_bytes(s)
