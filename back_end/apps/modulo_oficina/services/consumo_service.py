"""Métricas de consumo SaaS por oficina.

Centraliza a leitura de "quanto a oficina está consumindo" em três eixos:

  - Usuários ativos vs limite do plano
  - Ordens de Serviço criadas no mês corrente vs limite mensal do plano
  - Armazenamento (anexos da OS + logo da oficina) em MB vs cota do plano

Cada métrica retorna um `RecursoConsumo` com `usado`, `limite`, `restante`,
`percentual_uso`, `atingiu_limite`, `proximo_do_limite` e a flag
`bloqueio_ativo` (vinda das configurações globais).

A ideia é ter UMA fonte da verdade para:
  - validações no momento da criação (bloqueio quando atingir);
  - painel da oficina (UI mostra barra de progresso + alerta amarelo);
  - painel do admin SaaS (relatório de consumo por oficina, com
    detecção precoce de quem está perto de estourar);
  - integração futura com cobrança por sobreuso (overage).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from django.db.models import Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.modulo_adm.services.configuracoes_service import obter_flag

from ..models import Documento, Funcionario, Oficina, OrdemServico


# ---------------------------------------------------------------------------
# Tipo de retorno
# ---------------------------------------------------------------------------

@dataclass
class RecursoConsumo:
    """Estado de consumo de um recurso (usuários, OS, storage…)."""
    chave: str               # "usuarios" | "os_mensal" | "storage_mb"
    label: str               # rótulo amigável p/ UI
    unidade: str             # "" | "MB" | "OS"
    usado: float
    limite: float
    bloqueio_ativo: bool = True

    @property
    def restante(self) -> float:
        if self.limite <= 0:
            return 0.0
        return max(0.0, self.limite - self.usado)

    @property
    def percentual_uso(self) -> float:
        if self.limite <= 0:
            return 100.0
        return round((self.usado / self.limite) * 100.0, 1)

    @property
    def atingiu_limite(self) -> bool:
        return self.limite > 0 and self.usado >= self.limite

    @property
    def proximo_do_limite(self) -> bool:
        """Aviso amarelo: ≥ 80 %."""
        return self.limite > 0 and self.percentual_uso >= 80.0

    def to_dict(self):
        return {
            "chave": self.chave,
            "label": self.label,
            "unidade": self.unidade,
            "usado": round(self.usado, 2),
            "limite": round(self.limite, 2),
            "restante": round(self.restante, 2),
            "percentual_uso": self.percentual_uso,
            "atingiu_limite": self.atingiu_limite,
            "proximo_do_limite": self.proximo_do_limite,
            "bloqueio_ativo": self.bloqueio_ativo,
        }


# ---------------------------------------------------------------------------
# Helpers de leitura
# ---------------------------------------------------------------------------

def _flag_int(chave: str, fallback: int) -> int:
    valor = obter_flag(chave, default=fallback)
    try:
        return max(0, int(valor))
    except (TypeError, ValueError):
        return fallback


def _flag_bool(chave: str, fallback: bool = True) -> bool:
    valor = obter_flag(chave, default=fallback)
    return bool(valor)


def _inicio_do_mes(agora: Optional[datetime] = None) -> datetime:
    agora = agora or timezone.now()
    return agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


# ---------------------------------------------------------------------------
# Cálculo por recurso
# ---------------------------------------------------------------------------

def _override(oficina, campo):
    """Retorna o valor sobrescrito (ou None) para um campo da oficina."""
    try:
        ov = oficina.limites_override  # OneToOne related_name
    except Exception:
        return None
    return getattr(ov, campo, None)


def consumo_usuarios(oficina: Oficina) -> RecursoConsumo:
    """Funcionários ativos vs limite do plano (com override por oficina).

    Defaults alinhados ao Quadro 6.3 do TCC (Planos de Assinatura):
        teste   = 1 usuário
        basico  = 2 usuários
        premium = 5 usuários
    """
    plano = oficina.plano_atual or "basico"
    limite = _override(oficina, "limite_usuarios")
    if limite is None:
        limite = _flag_int(
            f"limite_usuarios_{plano}",
            {"teste": 1, "basico": 2, "premium": 5}.get(plano, 2),
        )
    usados = Funcionario.objects.filter(oficina=oficina, is_active=True).count()
    return RecursoConsumo(
        chave="usuarios",
        label="Usuários ativos",
        unidade="",
        usado=usados,
        limite=limite,
        bloqueio_ativo=_flag_bool("bloquear_ao_atingir_limite_usuarios"),
    )


def consumo_os_mes(oficina: Oficina, agora: Optional[datetime] = None) -> RecursoConsumo:
    """Ordens de Serviço criadas no mês corrente (com override por oficina).

    Defaults alinhados ao Quadro 6.3 do TCC (Planos de Assinatura):
        teste   = 10 OS (vale para os 7 dias do plano, mas usamos a mesma
                  janela mensal — o plano expira antes do reset do mês)
        basico  = 30 OS / mês
        premium = 50 OS / mês
    """
    plano = oficina.plano_atual or "basico"
    limite = _override(oficina, "limite_os_mensal")
    if limite is None:
        limite = _flag_int(
            f"limite_os_mensal_{plano}",
            {"teste": 10, "basico": 30, "premium": 50}.get(plano, 30),
        )
    inicio_mes = _inicio_do_mes(agora)
    usadas = OrdemServico.objects.filter(
        oficina=oficina, criado_em__gte=inicio_mes,
    ).count()
    return RecursoConsumo(
        chave="os_mensal",
        label="Ordens de Serviço (mês)",
        unidade="OS",
        usado=usadas,
        limite=limite,
        bloqueio_ativo=_flag_bool("bloquear_ao_atingir_limite_os"),
    )


def consumo_storage(oficina: Oficina) -> RecursoConsumo:
    """Soma do tamanho de anexos: documentos da OS + logo da oficina.

    Defaults alinhados ao Quadro 6.3 do TCC (Planos de Assinatura):
        teste   = 1 GB  (1024 MB)
        basico  = 1 GB  (1024 MB)
        premium = 5 GB  (5120 MB)

    Implementação:
      - Documento.arquivo: FileField. Lemos os bytes via storage.size()
        para evitar carregar o arquivo todo.
      - Logo da oficina: ImageField. Mesma estratégia.
      - Convertemos para MB (base 1024² seguindo convenção de armazenamento).
    """
    plano = oficina.plano_atual or "basico"
    limite_mb = _override(oficina, "limite_storage_mb")
    if limite_mb is None:
        limite_mb = _flag_int(
            f"limite_storage_mb_{plano}",
            {"teste": 1024, "basico": 1024, "premium": 5120}.get(plano, 1024),
        )

    bytes_totais = 0
    docs = Documento.objects.filter(os__oficina=oficina).only("arquivo")
    for doc in docs.iterator(chunk_size=200):
        try:
            if doc.arquivo and doc.arquivo.name:
                bytes_totais += doc.arquivo.storage.size(doc.arquivo.name)
        except (FileNotFoundError, OSError):
            # Anexo apagado fora do Django ou storage indisponível —
            # ignora silenciosamente para não derrubar a métrica.
            continue
    # Logo da oficina
    try:
        if oficina.logo and oficina.logo.name:
            bytes_totais += oficina.logo.storage.size(oficina.logo.name)
    except (FileNotFoundError, OSError):
        pass

    usado_mb = bytes_totais / (1024 * 1024)
    return RecursoConsumo(
        chave="storage_mb",
        label="Armazenamento",
        unidade="MB",
        usado=usado_mb,
        limite=limite_mb,
        bloqueio_ativo=_flag_bool("bloquear_ao_atingir_limite_storage"),
    )


# ---------------------------------------------------------------------------
# API pública (consolidação)
# ---------------------------------------------------------------------------

def consumo_oficina(oficina: Oficina) -> dict:
    """Snapshot completo de consumo para uma oficina."""
    if oficina is None:
        raise ValueError("Oficina inválida.")
    return {
        "oficina_id": oficina.id,
        "oficina_nome": oficina.nome,
        "plano": oficina.plano_atual or "basico",
        "calculado_em": timezone.now().isoformat(),
        "recursos": [
            consumo_usuarios(oficina).to_dict(),
            consumo_os_mes(oficina).to_dict(),
            consumo_storage(oficina).to_dict(),
        ],
    }


# ---------------------------------------------------------------------------
# Validações para uso nos serializers (bloqueio na hora da criação)
# ---------------------------------------------------------------------------

def assegurar_pode_criar_os(oficina: Oficina) -> None:
    """Levanta ValueError quando criar uma nova OS estouraria a quota."""
    r = consumo_os_mes(oficina)
    if r.bloqueio_ativo and r.atingiu_limite:
        raise ValueError(
            f"Limite mensal de Ordens de Serviço do plano {oficina.plano_atual or 'basico'} "
            f"atingido ({int(r.usado)}/{int(r.limite)}). "
            "Faça upgrade do plano ou aguarde o próximo mês."
        )


def assegurar_pode_upload(oficina: Oficina, tamanho_bytes: int) -> None:
    """Levanta ValueError quando um upload estouraria a cota de storage."""
    r = consumo_storage(oficina)
    if not r.bloqueio_ativo:
        return
    novo_total_mb = r.usado + (tamanho_bytes / (1024 * 1024))
    if r.limite > 0 and novo_total_mb > r.limite:
        raise ValueError(
            f"Upload bloqueado: este arquivo ultrapassa a cota de armazenamento "
            f"do plano ({r.usado:.1f} MB usados de {r.limite:.0f} MB). "
            "Libere espaço removendo anexos antigos ou faça upgrade do plano."
        )
