"""Validação de uploads de arquivos para a Ordem de Serviço.

Regras aplicadas por arquivo:
  1. Tamanho máximo (`upload_os_tamanho_max_mb`)
  2. MIME aceito (`upload_os_tipos_permitidos`)
  3. Extensão aceita (`upload_os_extensoes_permitidas`)

A lista vazia em (2) ou (3) significa "qualquer". Em produção,
recomenda-se manter ambas preenchidas para defesa em profundidade
(MIME pode ser spoofado, extensão é um sanity check adicional).

O front pode consultar `GET /api/oficina/upload-os/regras/` para já
filtrar/validar antes do envio (melhor UX) — mas o backend NÃO
confia no front, sempre valida.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable, List

from apps.modulo_adm.services.configuracoes_service import obter_flag


# Defaults consistentes com o seed (caso o banco esteja vazio em testes).
_DEFAULT_TAMANHO_MB = 10
_DEFAULT_MIMES = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
]
_DEFAULT_EXTENSOES = ["jpg", "jpeg", "png", "webp", "gif", "pdf"]


@dataclass
class RegrasUpload:
    tamanho_max_mb: int
    mimes_permitidos: List[str]
    extensoes_permitidas: List[str]

    @property
    def tamanho_max_bytes(self) -> int:
        return max(0, int(self.tamanho_max_mb)) * 1024 * 1024

    def to_dict(self):
        return {
            "tamanho_max_mb": self.tamanho_max_mb,
            "tamanho_max_bytes": self.tamanho_max_bytes,
            "mimes_permitidos": list(self.mimes_permitidos),
            "extensoes_permitidas": list(self.extensoes_permitidas),
        }


def obter_regras() -> RegrasUpload:
    """Lê as regras vigentes (com cache via obter_flag)."""
    return RegrasUpload(
        tamanho_max_mb=int(obter_flag("upload_os_tamanho_max_mb", _DEFAULT_TAMANHO_MB) or 0),
        mimes_permitidos=_normalizar_lista(
            obter_flag("upload_os_tipos_permitidos", _DEFAULT_MIMES),
        ),
        extensoes_permitidas=_normalizar_lista(
            obter_flag("upload_os_extensoes_permitidas", _DEFAULT_EXTENSOES),
            lower=True, sem_ponto=True,
        ),
    )


def _normalizar_lista(valor, *, lower: bool = False, sem_ponto: bool = False) -> List[str]:
    if not valor:
        return []
    if isinstance(valor, str):
        # Aceita "pdf, jpg, png" ou lista JSON serializada.
        itens = [v.strip() for v in valor.split(",") if v.strip()]
    elif isinstance(valor, (list, tuple)):
        itens = [str(v).strip() for v in valor if str(v).strip()]
    else:
        return []
    if lower:
        itens = [v.lower() for v in itens]
    if sem_ponto:
        itens = [v.lstrip(".") for v in itens]
    return itens


def _extensao_do_nome(nome: str) -> str:
    _, ext = os.path.splitext(nome or "")
    return ext.lstrip(".").lower()


def validar_arquivo(arquivo, regras: RegrasUpload = None) -> None:
    """Levanta ValueError quando o arquivo viola alguma regra.

    `arquivo` deve ter os atributos `.name`, `.size` e (opcional)
    `.content_type` — compatível com `UploadedFile` do Django.
    """
    if regras is None:
        regras = obter_regras()

    # 1. Tamanho
    tamanho = getattr(arquivo, "size", None)
    if tamanho is None:
        raise ValueError("Arquivo sem tamanho declarado — upload rejeitado.")
    if regras.tamanho_max_mb > 0 and tamanho > regras.tamanho_max_bytes:
        mb_arquivo = tamanho / (1024 * 1024)
        raise ValueError(
            f"Arquivo '{arquivo.name}' tem {mb_arquivo:.1f} MB — excede o "
            f"limite de {regras.tamanho_max_mb} MB por arquivo."
        )

    # 2. MIME
    mime = (getattr(arquivo, "content_type", "") or "").lower()
    if regras.mimes_permitidos and mime and mime not in {m.lower() for m in regras.mimes_permitidos}:
        raise ValueError(
            f"Tipo '{mime}' não é aceito. Aceitos: "
            f"{', '.join(regras.mimes_permitidos)}."
        )

    # 3. Extensão (sanity check, sobretudo quando o navegador não envia MIME)
    ext = _extensao_do_nome(getattr(arquivo, "name", ""))
    if regras.extensoes_permitidas and ext and ext not in regras.extensoes_permitidas:
        raise ValueError(
            f"Extensão '.{ext}' não é aceita. Aceitas: "
            f"{', '.join('.' + e for e in regras.extensoes_permitidas)}."
        )


def validar_batch(arquivos: Iterable) -> None:
    """Aplica `validar_arquivo` em todos. Aborta no primeiro erro."""
    regras = obter_regras()
    for arq in arquivos:
        validar_arquivo(arq, regras)
