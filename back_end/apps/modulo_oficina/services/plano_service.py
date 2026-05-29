"""Service de planos SaaS: limites, consumo e bloqueios.

A regra de "quantos funcionários cabem em um plano" vive aqui — única
fonte para o serializer de funcionário (validação), para a view de
"meu plano" (UI), e para alertas no painel.

Os limites são lidos via `obter_flag("limite_usuarios_<plano>")`, ou
seja, o admin global pode ajustar no painel sem precisar de migration.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from apps.modulo_adm.services.configuracoes_service import obter_flag

from ..models import Funcionario, Oficina


@dataclass
class StatusPlano:
    plano: str
    limite_usuarios: int
    usuarios_ativos: int
    bloqueio_ativo: bool

    @property
    def restantes(self) -> int:
        if self.limite_usuarios <= 0:
            return 0
        return max(0, self.limite_usuarios - self.usuarios_ativos)

    @property
    def percentual_uso(self) -> float:
        if self.limite_usuarios <= 0:
            return 100.0
        return round((self.usuarios_ativos / self.limite_usuarios) * 100.0, 1)

    @property
    def atingiu_limite(self) -> bool:
        return self.usuarios_ativos >= self.limite_usuarios > 0

    @property
    def proximo_do_limite(self) -> bool:
        """Aviso "amarelo": >= 80% do limite consumido."""
        return self.limite_usuarios > 0 and self.percentual_uso >= 80.0

    def to_dict(self):
        return {
            "plano": self.plano,
            "limite_usuarios": self.limite_usuarios,
            "usuarios_ativos": self.usuarios_ativos,
            "restantes": self.restantes,
            "percentual_uso": self.percentual_uso,
            "atingiu_limite": self.atingiu_limite,
            "proximo_do_limite": self.proximo_do_limite,
            "bloqueio_ativo": self.bloqueio_ativo,
        }


def _limite_para_plano(plano: str) -> int:
    """Resolve o limite via configuração global, com fallback razoável."""
    fallback = {"basico": 5, "premium": 25}.get(plano, 5)
    valor = obter_flag(f"limite_usuarios_{plano}", default=fallback)
    try:
        return max(0, int(valor))
    except (TypeError, ValueError):
        return fallback


def status_plano(oficina: Oficina) -> StatusPlano:
    """Retorna o consumo atual da oficina + limite do plano."""
    if oficina is None:
        raise ValueError("Oficina inválida.")
    plano = oficina.plano_atual or "basico"
    limite = _limite_para_plano(plano)
    ativos = Funcionario.objects.filter(
        oficina=oficina, is_active=True,
    ).count()
    bloqueio = bool(obter_flag("bloquear_ao_atingir_limite_usuarios", default=True))
    return StatusPlano(
        plano=plano,
        limite_usuarios=limite,
        usuarios_ativos=ativos,
        bloqueio_ativo=bloqueio,
    )


def assegurar_pode_criar_funcionario(oficina: Oficina) -> None:
    """Levanta ValueError quando a criação deve ser bloqueada.

    Chamado pelo serializer de funcionário antes do create.
    """
    sp = status_plano(oficina)
    if sp.bloqueio_ativo and sp.atingiu_limite:
        raise ValueError(
            f"Limite de usuários do plano {sp.plano} atingido "
            f"({sp.usuarios_ativos}/{sp.limite_usuarios}). "
            "Faça upgrade do plano ou desative um funcionário antes de criar um novo."
        )


def assegurar_pode_reativar(oficina: Oficina, funcionario: Optional[Funcionario]) -> None:
    """Mesma checagem, mas usada quando vamos REATIVAR alguém que estava desativado.

    Permite editar nome/permissão de funcionário inativo sem bloquear, mas
    reativá-lo só passa se houver vaga.
    """
    if funcionario is None or funcionario.is_active:
        return
    sp = status_plano(oficina)
    if sp.bloqueio_ativo and sp.atingiu_limite:
        raise ValueError(
            f"Não é possível reativar o funcionário: limite do plano {sp.plano} "
            f"já atingido ({sp.usuarios_ativos}/{sp.limite_usuarios})."
        )
