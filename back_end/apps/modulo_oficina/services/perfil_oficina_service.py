"""Regras de negócio para o perfil da oficina (criação, leitura, atualização)."""
import json
from datetime import datetime
from django.utils import timezone

from ..models import Oficina, Funcionario


_DIAS_SEMANA_MAP = {
    "mon": "seg",
    "tue": "ter",
    "wed": "qua",
    "thu": "qui",
    "fri": "sex",
    "sat": "sab",
    "sun": "dom",
}


def _calcular_aberto_agora(oficina):
    """Verifica se a oficina está aberta neste exato momento."""
    if not (oficina.horario_abertura and oficina.horario_fechamento and oficina.dias_funcionamento):
        return False

    agora = timezone.localtime(timezone.now())
    dia_atual = _DIAS_SEMANA_MAP.get(agora.strftime("%a").lower())
    if dia_atual not in oficina.dias_funcionamento:
        return False

    hora_atual = agora.time()
    return oficina.horario_abertura <= hora_atual <= oficina.horario_fechamento


def _historico_virtual(oficina):
    historico = [
        {
            "acao": "Criação da Oficina",
            "data": oficina.criado_em.strftime("%d/%m/%Y %H:%M"),
            "usuario": "Sistema",
        }
    ]
    if oficina.atualizado_em > oficina.criado_em:
        historico.append({
            "acao": "Última Atualização Cadastral",
            "data": oficina.atualizado_em.strftime("%d/%m/%Y %H:%M"),
            "usuario": "Administrador",
        })
    return historico


def montar_payload_perfil(oficina):
    """Monta o dicionário de resposta da rota GET /perfil/."""
    return {
        "dadosBasicos": {
            "nome": oficina.nome,
            "cnpj": oficina.cnpj,
            "email": oficina.email,
            "telefone": oficina.telefone,
            "especialidade": oficina.especialidade,
        },
        "endereco": {
            "cep": oficina.cep,
            "logradouro": oficina.logradouro,
            "numero": oficina.numero,
            "complemento": oficina.complemento or "",
            "bairro": oficina.bairro,
            "cidade": oficina.cidade,
            "estado": oficina.estado,
        },
        "horarios": {
            "abertura": oficina.horario_abertura.strftime("%H:%M") if oficina.horario_abertura else "",
            "fechamento": oficina.horario_fechamento.strftime("%H:%M") if oficina.horario_fechamento else "",
            "diasFuncionamento": oficina.dias_funcionamento or [],
        },
        "plano": {
            "tipo": oficina.plano_atual,
            "status": "Ativo",
            "expiracao": "01/01/2027",
        },
        "historico": _historico_virtual(oficina),
        "status": {
            "ultimaAtualizacao": oficina.atualizado_em.strftime("%d/%m/%Y"),
            "logoEnviada": bool(oficina.logo),
        },
        "logo_url": oficina.logo.url if oficina.logo else "",
        "aberto_agora": _calcular_aberto_agora(oficina),
    }


def _normalizar_dias(valor):
    if isinstance(valor, list):
        return valor
    if isinstance(valor, str):
        try:
            parsed = json.loads(valor)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def atualizar_perfil_oficina(oficina, dados, arquivo_logo=None):
    """Aplica as alterações vindas do front-end no perfil da oficina."""
    if arquivo_logo is not None:
        oficina.logo = arquivo_logo

    basicos = dados.get("dadosBasicos", {})
    endereco = dados.get("endereco", {})
    horarios = dados.get("horarios", {})
    plano = dados.get("plano", {})

    oficina.nome = basicos.get("nome", oficina.nome)
    oficina.email = basicos.get("email", oficina.email)
    oficina.telefone = basicos.get("telefone", oficina.telefone)
    oficina.especialidade = basicos.get("especialidade", oficina.especialidade)

    oficina.cep = endereco.get("cep", oficina.cep)
    oficina.logradouro = endereco.get("logradouro", oficina.logradouro)
    oficina.numero = endereco.get("numero", oficina.numero)
    oficina.complemento = endereco.get("complemento", oficina.complemento)
    oficina.bairro = endereco.get("bairro", oficina.bairro)
    oficina.cidade = endereco.get("cidade", oficina.cidade)
    oficina.estado = endereco.get("estado", oficina.estado)

    if horarios.get("abertura"):
        oficina.horario_abertura = datetime.strptime(horarios["abertura"], "%H:%M").time()
    if horarios.get("fechamento"):
        oficina.horario_fechamento = datetime.strptime(horarios["fechamento"], "%H:%M").time()

    if "diasFuncionamento" in horarios:
        oficina.dias_funcionamento = _normalizar_dias(horarios.get("diasFuncionamento"))

    if "tipo" in plano:
        oficina.plano_atual = plano["tipo"]

    oficina.save()
    return oficina


def criar_oficina_e_vincular_admin(dados, arquivo_logo=None, usuario=None):
    """Cria uma oficina inicial (cadastro) e, se houver usuário, vincula como admin."""
    dias = _normalizar_dias(dados.get("dias_funcionamento", "[]"))

    horario_abertura = (
        datetime.strptime(dados["horario_abertura"], "%H:%M").time()
        if dados.get("horario_abertura")
        else None
    )
    horario_fechamento = (
        datetime.strptime(dados["horario_fechamento"], "%H:%M").time()
        if dados.get("horario_fechamento")
        else None
    )

    oficina = Oficina.objects.create(
        nome=dados.get("nome", "Nova Oficina"),
        cnpj=dados.get("cnpj", ""),
        email=dados.get("email", ""),
        telefone=dados.get("telefone", ""),
        especialidade=dados.get("especialidade", "geral"),
        horario_abertura=horario_abertura,
        horario_fechamento=horario_fechamento,
        dias_funcionamento=dias,
        cep=dados.get("cep", ""),
        logradouro=dados.get("logradouro", ""),
        numero=dados.get("numero", ""),
        complemento=dados.get("complemento", ""),
        bairro=dados.get("bairro", ""),
        cidade=dados.get("cidade", ""),
        estado=dados.get("estado", ""),
        plano_atual=dados.get("plano", "basico"),
    )

    if arquivo_logo is not None:
        oficina.logo = arquivo_logo
        oficina.save(update_fields=["logo"])

    if usuario is not None and usuario.is_authenticated:
        Funcionario.objects.create(
            user=usuario,
            oficina=oficina,
            permissao="admin",
            is_active=True,
        )

    return oficina
