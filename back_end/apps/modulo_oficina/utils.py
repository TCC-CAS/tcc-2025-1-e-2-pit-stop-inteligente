"""Utilitários internos compartilhados entre as views do modulo_oficina."""
from .models import Funcionario, HistoricoOS, Oficina


# `SESSION_OFICINA_KEY` vem de `services.auth_service`. Importamos LAZY
# (dentro da função) para evitar ciclo de import quando outro módulo do
# projeto importa `services.<algum_service>` antes que `utils.py` termine
# de ser carregado.
def _session_key():
    from .services.auth_service import SESSION_OFICINA_KEY
    return SESSION_OFICINA_KEY


def get_oficina_atual(request):
    """Retorna a oficina ativa para a request (multi-tenant por sessão).

    Estratégia:
        1. Se houver `oficina_atual_id` na sessão e o usuário tiver vínculo,
           retorna essa oficina (caminho normal pós-login).
        2. Se o usuário tiver apenas um vínculo, retorna o vínculo único.
        3. Como fallback de desenvolvimento (sem login), retorna a primeira.
    """
    oficina_id = None
    if hasattr(request, "session"):
        oficina_id = request.session.get(_session_key())

    user = getattr(request, "user", None)

    # Caminho 1: sessão indica oficina ativa
    if oficina_id and user and user.is_authenticated:
        if user.is_superuser:
            return Oficina.objects.filter(id=oficina_id).first()
        funcionario = (
            Funcionario.objects.filter(user=user, oficina_id=oficina_id, is_active=True)
            .select_related("oficina")
            .first()
        )
        if funcionario:
            return funcionario.oficina

    # Caminho 2: vínculo único
    if user and user.is_authenticated and not user.is_superuser:
        unicos = list(
            Funcionario.objects.filter(user=user, is_active=True)
            .select_related("oficina")[:2]
        )
        if len(unicos) == 1:
            return unicos[0].oficina

    # Caminho 3: fallback de desenvolvimento
    return Oficina.objects.first()


def registrar_historico(os, tipo, descricao, detalhes="", request=None):
    """Cria um registro de histórico/timeline para a OS informada."""
    usuario_logado = request.user if request and request.user.is_authenticated else None
    return HistoricoOS.objects.create(
        os=os,
        tipo=tipo,
        descricao=descricao,
        detalhes=detalhes,
        usuario=usuario_logado,
    )
