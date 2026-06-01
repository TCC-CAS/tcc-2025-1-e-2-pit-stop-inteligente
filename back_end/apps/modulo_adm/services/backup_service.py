"""Backup e restauração do banco de dados (JSON via dumpdata/loaddata).

Este service é uma camada fina sobre os comandos nativos do Django
(`dumpdata` / `loaddata`). Funciona bem para volumes pequenos a médios
do TCC e tem a vantagem de:

- não exigir cliente externo (pg_dump) instalado no servidor;
- gerar um único arquivo JSON portável entre engines;
- permitir restauração granular se necessário.

Para volumes grandes em produção, recomendamos um pipeline dedicado
(pg_dump + storage externo), fora do escopo deste módulo.
"""
import io
import json
import os
import tempfile
from datetime import datetime

from django.apps import apps
from django.core import management
from django.db import transaction

from ..utils import registrar_auditoria


# Apps incluídos no backup. `auth` é incluído para preservar usuários/permissões.
# `contenttypes` é excluído porque é gerado automaticamente pelas migrations e
# colidiria com `loaddata`.
APPS_INCLUIDOS = [
    "auth",
    "modulo_oficina",
    "modulo_cliente",
    "modulo_adm",
]
APPS_EXCLUIDOS = [
    "contenttypes",
    "sessions",
    "admin.logentry",
]


def gerar_backup_json(request=None):
    """Retorna um par (filename, bytes_io) com o dump JSON do banco.

    Usa `dumpdata` com indent=2 — o arquivo é legível e razoavelmente
    compacto para volumes do TCC.
    """
    buffer = io.StringIO()
    management.call_command(
        "dumpdata",
        *APPS_INCLUIDOS,
        natural_foreign=True,
        natural_primary=True,
        indent=2,
        exclude=APPS_EXCLUIDOS,
        stdout=buffer,
    )
    conteudo = buffer.getvalue()
    bytes_io = io.BytesIO(conteudo.encode("utf-8"))
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"pitstop_backup_{timestamp}.json"

    registrar_auditoria(
        request,
        acao="backup.exportar",
        recurso="banco",
        nivel="warning",
        descricao=f"Backup gerado ({_tamanho_bytes(conteudo)}, {filename}).",
        metadados={"filename": filename, "apps": APPS_INCLUIDOS},
    )
    return filename, bytes_io


def restaurar_backup_json(arquivo, request=None):
    """Restaura o banco a partir de um arquivo JSON (resultado de gerar_backup).

    Para evitar duplicações e conflitos, executa `loaddata` em transação:
    se algo falhar no meio, o banco volta ao estado anterior.

    `arquivo` é um Django UploadedFile.
    """
    if arquivo is None:
        raise ValueError("Selecione o arquivo .json gerado pelo backup.")

    nome = (arquivo.name or "").lower()
    if not nome.endswith(".json"):
        raise ValueError("O arquivo precisa ter extensão .json.")

    # Lê e valida o conteúdo antes de aplicar
    raw = arquivo.read()
    try:
        dados = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("Arquivo inválido: não é um JSON UTF-8.")
    if not isinstance(dados, list) or not dados:
        raise ValueError("Arquivo de backup vazio ou em formato inesperado.")

    # Confere se todos os modelos do dump existem (defesa básica contra
    # tentativas de carregar dumps incompatíveis)
    modelos_invalidos = []
    for item in dados:
        app_label, _, model = (item.get("model") or "").partition(".")
        if not app_label or not model:
            modelos_invalidos.append(item.get("model"))
            continue
        try:
            apps.get_model(app_label, model)
        except LookupError:
            modelos_invalidos.append(item.get("model"))
    if modelos_invalidos:
        raise ValueError(
            "O backup faz referência a modelos desconhecidos: "
            + ", ".join(sorted(set(modelos_invalidos))[:5])
            + "."
        )

    # Persiste em um arquivo temporário para o loaddata
    tmp = tempfile.NamedTemporaryFile(
        suffix=".json", delete=False, mode="wb",
    )
    try:
        tmp.write(raw)
        tmp.flush()
        tmp.close()
        with transaction.atomic():
            management.call_command("loaddata", tmp.name, verbosity=0)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    registrar_auditoria(
        request,
        acao="backup.restaurar",
        recurso="banco",
        nivel="critico",
        descricao=f"Banco restaurado a partir de '{arquivo.name}'.",
        metadados={"filename": arquivo.name, "registros": len(dados)},
    )
    return {"registros_aplicados": len(dados)}


def _tamanho_bytes(texto):
    tam = len(texto.encode("utf-8"))
    if tam < 1024:
        return f"{tam} B"
    if tam < 1024 * 1024:
        return f"{tam / 1024:.1f} KB"
    return f"{tam / (1024 * 1024):.2f} MB"
