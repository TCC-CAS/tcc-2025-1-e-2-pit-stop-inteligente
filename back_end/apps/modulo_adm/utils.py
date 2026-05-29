"""Utilitários internos do modulo_adm."""
from .models import AuditoriaLog


def _extrair_ip(request):
    if request is None:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _user_agent(request):
    if request is None:
        return ""
    return (request.META.get("HTTP_USER_AGENT") or "")[:255]


def registrar_auditoria(
    request,
    acao,
    descricao,
    *,
    recurso="",
    recurso_id="",
    nivel="info",
    metadados=None,
):
    """Cria um registro de auditoria atrelado ao usuário corrente.

    `request` pode ser None (útil em rotinas batch); nesse caso o registro
    fica sem ip/usuário/user-agent.
    """
    usuario = None
    if request is not None and getattr(request, "user", None) and request.user.is_authenticated:
        usuario = request.user

    return AuditoriaLog.objects.create(
        usuario=usuario,
        nivel=nivel,
        acao=acao,
        descricao=descricao,
        recurso=recurso or "",
        recurso_id=str(recurso_id) if recurso_id else "",
        metadados=metadados or None,
        ip=_extrair_ip(request),
        user_agent=_user_agent(request),
    )
