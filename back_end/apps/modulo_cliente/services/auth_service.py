"""Autenticação do cliente no portal.

Fluxo recomendado (a partir de 2026-05):
    1. Oficina gera um código de acesso para a OS (CodigoAcessoOS).
    2. Oficina entrega o código ao cliente (papel, WhatsApp, e-mail).
    3. Cliente entra com `codigo` + `cpf_cnpj`.
    4. O back valida o código (expira em N dias, máx. de tentativas) e
       confronta o CPF/CNPJ do cliente associado àquela OS.

Mantemos o fluxo legado (CPF + número de OS) como compatibilidade para
quem ainda não migrou — mas a tela do cliente é orientada ao código.
"""
import re

from django.utils import timezone

from apps.modulo_oficina.models import Cliente, OrdemServico

from ..models import CodigoAcessoOS
from ..permissions import SESSION_CLIENTE_KEY
from ..utils import somente_digitos


_OS_NUMBER_RE = re.compile(r"\d+")


def _extrair_numero_os(valor):
    if valor is None:
        return None
    if isinstance(valor, int):
        return valor
    matches = _OS_NUMBER_RE.findall(str(valor))
    if not matches:
        return None
    try:
        return int("".join(matches))
    except ValueError:
        return None


def _normalizar_codigo(valor):
    return (valor or "").strip().upper().replace(" ", "").replace("-", "")


def autenticar_cliente(request, cpf_cnpj, numero_os=None, codigo=None):
    """Valida e marca a sessão do cliente.

    Aceita:
        - `codigo` (preferencial) — bate em CodigoAcessoOS + CPF/CNPJ.
        - `numero_os` (compat) — bate id da OS + CPF/CNPJ do cliente.

    Inclui defesas anti-bot e rate-limit (igual ao login da oficina), com
    o agravante de que o segundo fator aqui (código + CPF) é menos forte
    que senha, então o rate-limit é mais agressivo.

    Levanta `ValueError` com mensagem amigável em caso de falha.
    """
    from apps.modulo_adm.services.seguranca_service import (
        checar_rate_limit,
        detectar_honeypot,
        extrair_ip,
        acumular_evento_de_ip,
        _registrar_evento,
    )

    # Honeypot — bot preencheu o campo invisível
    if detectar_honeypot(request):
        raise ValueError("Acesso recusado.")

    # Rate limit por IP — protege contra força bruta no código
    ip = extrair_ip(request) or "0.0.0.0"
    rl = checar_rate_limit(
        "cliente_login", ip,
        limite=20, janela_segundos=10 * 60,
    )
    if not rl.permitido:
        raise ValueError(
            "Muitas tentativas. Aguarde alguns minutos e tente novamente."
        )

    cpf_digits = somente_digitos(cpf_cnpj)
    if len(cpf_digits) not in (11, 14):
        # CPF claramente inválido: registra como evento leve para identificar
        # scrapers tentando enumerar.
        _registrar_evento(
            "cliente_chave_invalida",
            request=request, alvo=str(cpf_cnpj)[:255],
            severidade="info",
            metadados={"motivo": "tamanho_cpf_invalido"},
        )
        raise ValueError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.")

    codigo_norm = _normalizar_codigo(codigo)
    os_obj = None

    if codigo_norm:
        os_obj = _validar_por_codigo(codigo_norm, cpf_digits)
    elif numero_os:
        os_obj = _validar_por_numero_os(numero_os, cpf_digits)
    else:
        raise ValueError("Informe o código de acesso fornecido pela oficina.")

    cliente = os_obj.cliente

    request.session.cycle_key()
    request.session[SESSION_CLIENTE_KEY] = cliente.id
    request.session.modified = True
    request.session.save()

    # Notifica a equipe administrativa do acesso (não bloqueia em caso de erro)
    try:
        from apps.modulo_adm.models import Notificacao
        Notificacao.criar(
            "acesso_cliente",
            f"Cliente acessou OS #{os_obj.id}",
            f"{cliente.nome} entrou no portal · CPF/CNPJ {cliente.cpf_cnpj}.",
            nivel="info",
            metadados={"os_id": os_obj.id, "cliente_id": cliente.id},
        )
    except Exception:
        pass

    return {
        "cliente": {
            "id": cliente.id,
            "nome": cliente.nome,
            "email": cliente.email,
            "telefone": cliente.telefone,
            "oficina_nome": cliente.oficina.nome if cliente.oficina else "",
        },
        "ordens_count": cliente.ordens_servico.count(),
        "os_inicial_id": os_obj.id,
    }


def _validar_por_codigo(codigo, cpf_digits):
    """Confere CodigoAcessoOS x CPF, controlando expiração e tentativas."""
    token = (
        CodigoAcessoOS.objects.select_related("os", "os__cliente")
        .filter(codigo=codigo)
        .first()
    )
    if token is None:
        raise ValueError(
            "Código de acesso inválido. Solicite um novo à oficina."
        )
    if token.revogado:
        raise ValueError(
            "Este código foi revogado. Peça um novo à oficina."
        )
    if token.expirado:
        raise ValueError(
            "Este código expirou. Peça um novo à oficina."
        )
    if token.bloqueado:
        raise ValueError(
            "Excedidas as tentativas para este código. Solicite um novo à oficina."
        )

    cliente = token.os.cliente
    if somente_digitos(cliente.cpf_cnpj) != cpf_digits:
        token.registrar_tentativa_falha()
        restantes = max(token.max_tentativas - token.tentativas, 0)
        if restantes <= 0:
            raise ValueError(
                "Os dados não conferem e o código foi bloqueado por excesso de tentativas. "
                "Solicite um novo à oficina."
            )
        raise ValueError(
            f"Os dados não conferem com este código. Tentativas restantes: {restantes}."
        )

    token.registrar_uso()
    return token.os


def _validar_por_numero_os(numero_os, cpf_digits):
    """Fluxo legado — mantido para compatibilidade com clientes antigos."""
    numero_os_int = _extrair_numero_os(numero_os)
    if numero_os_int is None or numero_os_int <= 0:
        raise ValueError("Informe um número de OS válido (somente dígitos).")
    os_obj = (
        OrdemServico.objects.select_related("cliente", "oficina")
        .filter(id=numero_os_int)
        .first()
    )
    if os_obj is None:
        raise ValueError("Não encontramos uma OS com este número.")
    if somente_digitos(os_obj.cliente.cpf_cnpj) != cpf_digits:
        raise ValueError(
            "Os dados informados não conferem. Verifique o CPF/CNPJ e o número da OS."
        )
    return os_obj


def encerrar_sessao_cliente(request):
    """Limpa apenas a chave do cliente — preserva login da oficina."""
    request.session.pop(SESSION_CLIENTE_KEY, None)
    request.session.modified = True
