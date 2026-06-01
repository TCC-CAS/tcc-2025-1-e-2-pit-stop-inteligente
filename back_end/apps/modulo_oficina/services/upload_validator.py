"""Validação de uploads de arquivos para a Ordem de Serviço.

Regras aplicadas por arquivo:
  1. Tamanho máximo (`upload_os_tamanho_max_mb`)
  2. MIME aceito (`upload_os_tipos_permitidos`)
  3. Extensão aceita (`upload_os_extensoes_permitidas`)
  4. Magic bytes — para imagens, abre o arquivo com Pillow e valida que
     o conteúdo realmente é uma imagem (defesa contra arquivos renomeados
     com extensão de imagem). Sem custo extra (Pillow já é dependência).
  5. Moderação de conteúdo — quando habilitada via env var
     `MODERACAO_IMAGEM_PROVEDOR`, chama um provedor externo (ex.: Sightengine)
     para detectar nudez/violência/conteúdo inapropriado. Quando desligada
     (padrão), os arquivos passam por todas as outras validações sem custo
     extra de chamada externa.

A lista vazia em (2) ou (3) significa "qualquer". Em produção,
recomenda-se manter ambas preenchidas para defesa em profundidade
(MIME pode ser spoofado, extensão é um sanity check adicional).

O front pode consultar `GET /api/oficina/upload-os/regras/` para já
filtrar/validar antes do envio (melhor UX) — mas o backend NÃO
confia no front, sempre valida.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Iterable, List

from django.conf import settings

from apps.modulo_adm.services.configuracoes_service import obter_flag

logger = logging.getLogger(__name__)

# MIMEs que devem ser validados por Pillow como imagem de verdade.
_MIMES_IMAGEM = {"image/jpeg", "image/png", "image/webp", "image/gif"}


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

    # 4. Magic bytes — confirma que arquivos declarados como imagem realmente
    #    são imagens válidas (Pillow consegue decodificar). Defende contra
    #    upload de executáveis/scripts renomeados como .jpg.
    if mime in _MIMES_IMAGEM:
        _validar_imagem_real(arquivo)

    # 5. Moderação de conteúdo (opcional). Sem provedor configurado, é no-op.
    if mime in _MIMES_IMAGEM:
        _moderar_conteudo(arquivo)


def _validar_imagem_real(arquivo) -> None:
    """Usa Pillow para confirmar que `arquivo` é uma imagem decodificável.

    Falhas comuns que isso captura:
      - Arquivos corrompidos
      - Arquivos de outro tipo renomeados (.exe → .jpg)
      - Imagens truncadas
    """
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:  # pragma: no cover — Pillow é dependência obrigatória
        logger.warning("Pillow não instalado; pulando validação de magic bytes.")
        return

    nome = getattr(arquivo, "name", "arquivo")
    try:
        arquivo.seek(0)
        img = Image.open(arquivo)
        img.verify()  # Verifica integridade sem carregar todos os pixels.
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError(
            f"Arquivo '{nome}' não é uma imagem válida (conteúdo corrompido "
            f"ou tipo não reconhecido)."
        ) from exc
    finally:
        # Devolve o ponteiro para o início para que o upload subsequente
        # consiga ler o conteúdo desde o byte 0.
        try:
            arquivo.seek(0)
        except Exception:  # pragma: no cover
            pass


def _moderar_conteudo(arquivo) -> None:
    """Roda moderação externa quando habilitada via env var.

    Provedores suportados (configurar `MODERACAO_IMAGEM_PROVEDOR`):
      - "off" (padrão): nenhuma chamada externa, retorna OK.
      - "sightengine": usa a API da Sightengine (free tier 500 ops/mês).
        Requer também `SIGHTENGINE_API_USER` e `SIGHTENGINE_API_SECRET`.

    Em caso de falha de conexão com o provedor, decidimos PASSAR o arquivo
    (fail-open) e logar warning — moderação não pode bloquear o fluxo
    operacional da oficina por instabilidade de serviço de terceiro.
    """
    provedor = getattr(settings, "MODERACAO_IMAGEM_PROVEDOR", "off").lower()
    if provedor == "off" or not provedor:
        return
    if provedor == "sightengine":
        _moderar_sightengine(arquivo)
    else:
        logger.warning("Provedor de moderação desconhecido: %r", provedor)


def _moderar_sightengine(arquivo) -> None:
    """Chamada à API da Sightengine para detectar conteúdo inapropriado.

    Verifica os modelos `nudity-2.0` e `gore`. Se alguma probabilidade
    passar do limiar (configurável via `MODERACAO_IMAGEM_LIMIAR`, padrão 0.6),
    rejeita o upload.
    """
    api_user = getattr(settings, "SIGHTENGINE_API_USER", "")
    api_secret = getattr(settings, "SIGHTENGINE_API_SECRET", "")
    if not api_user or not api_secret:
        logger.warning(
            "Sightengine ativo mas credenciais ausentes — moderação pulada."
        )
        return

    try:
        import requests
    except ImportError:  # pragma: no cover
        logger.warning("requests não instalado; moderação pulada.")
        return

    limiar = float(getattr(settings, "MODERACAO_IMAGEM_LIMIAR", 0.6) or 0.6)
    nome = getattr(arquivo, "name", "arquivo")

    try:
        arquivo.seek(0)
        resposta = requests.post(
            "https://api.sightengine.com/1.0/check.json",
            files={"media": arquivo},
            data={
                "models": "nudity-2.0,gore",
                "api_user": api_user,
                "api_secret": api_secret,
            },
            timeout=10,
        )
        dados = resposta.json() if resposta.ok else {}
    except (requests.RequestException, ValueError) as exc:
        # Fail-open: se a moderação externa falhar, deixamos passar e logamos
        # (não bloqueia o trabalho da oficina por instabilidade de terceiro).
        logger.warning("Sightengine indisponível: %s", exc)
        return
    finally:
        try:
            arquivo.seek(0)
        except Exception:  # pragma: no cover
            pass

    # Extrai a maior probabilidade de conteúdo inapropriado.
    nudez = (dados.get("nudity") or {})
    pior_nudez = max(
        float(nudez.get("sexual_activity", 0)),
        float(nudez.get("sexual_display", 0)),
        float(nudez.get("erotica", 0)),
        float(nudez.get("very_suggestive", 0)),
    )
    gore = float((dados.get("gore") or {}).get("prob", 0))

    if pior_nudez >= limiar or gore >= limiar:
        raise ValueError(
            f"Arquivo '{nome}' foi sinalizado como conteúdo inapropriado "
            f"(nudez={pior_nudez:.2f}, violência={gore:.2f}). "
            "Envie outra imagem."
        )


def validar_batch(arquivos: Iterable) -> None:
    """Aplica `validar_arquivo` em todos. Aborta no primeiro erro."""
    regras = obter_regras()
    for arq in arquivos:
        validar_arquivo(arq, regras)
