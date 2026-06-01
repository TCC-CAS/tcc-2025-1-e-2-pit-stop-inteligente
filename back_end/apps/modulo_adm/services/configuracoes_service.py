"""Service de configurações globais da aplicação.

Esse módulo concentra o catálogo de feature toggles + valores globais.
Cada chave tem metadados (tipo, categoria, descrição) usados pela UI
do painel para renderizar editores adequados.

`obter_flag(chave)` é o ponto de leitura — usa cache local de processo
para evitar query em todo request, com invalidação no momento da
atualização. Isso garante que mudanças no painel sejam aplicadas em
tempo real (sem reload manual do servidor).
"""
from threading import RLock

from ..models import ConfiguracaoGlobal
from ..utils import registrar_auditoria


# Cache simples em memória do processo. Como o painel ADM tem volume
# muito baixo de mudanças, é seguro confiar em cache curto + invalidação
# explícita no `atualizar_configuracao`. Em deploy multi-processo
# (gunicorn com N workers), cada worker terá sua cópia — boa o suficiente
# para flags simples (limites, toggles) que toleram alguns segundos de atraso.
_CACHE_FLAGS = {}
_CACHE_LOCK = RLock()


# Chaves padrão (semeadas na primeira execução).
# Cada item descreve o feature toggle com metadados completos:
#   - tipo: bool | int | str | url | json
#   - categoria: agrupa na UI ('Operação', 'Aparência', 'Limites', etc.)
_SEED_DEFAULT = [
    # ---- Operação / runtime ----
    {
        "chave": "notificacoes_email_habilitado",
        "valor": True,
        "descricao": "Envia notificações por e-mail aos clientes em eventos da OS.",
        "tipo": "bool",
        "categoria": "Operação",
        "ambiente": "todos",
    },
    {
        "chave": "ambiente",
        "valor": "producao",
        "descricao": "Ambiente lógico. Aparece no Production Health e no banner do painel.",
        "tipo": "str",
        "categoria": "Operação",
        "ambiente": "todos",
    },

    # ---- Negócio ----
    {
        "chave": "prazo_padrao_aprovacao_dias",
        "valor": 3,
        "descricao": "Prazo padrão (em dias) para o cliente aprovar um orçamento.",
        "tipo": "int",
        "categoria": "Negócio",
        "ambiente": "todos",
    },

    # ---- Aparência ----
    {
        "chave": "tema_padrao",
        "valor": "light",
        "descricao": "Tema padrão sugerido aos novos usuários (light/dark).",
        "tipo": "str",
        "categoria": "Aparência",
        "ambiente": "todos",
    },

    # ---- Documentos legais ----
    {
        "chave": "termos_uso_url",
        "valor": "/static/legal/termos-de-uso.pdf",
        "descricao": "URL do documento atualizado de Termos de Uso.",
        "tipo": "url",
        "categoria": "Legal",
        "ambiente": "todos",
    },
    {
        "chave": "politica_privacidade_url",
        "valor": "/static/legal/politica-privacidade.pdf",
        "descricao": "URL do documento atualizado da Política de Privacidade.",
        "tipo": "url",
        "categoria": "Legal",
        "ambiente": "todos",
    },

    # ---- Limites SaaS (por plano) ----
    # São consultados via `obter_flag("limite_<recurso>_<plano>")`.
    # IMPORTANTE: a regra é "nunca ilimitado sem controle". Valores são
    # quotas concretas; mude para 0 só se quiser remover a quota
    # explicitamente (e ainda assim contamos uso para o painel).
    {
        "chave": "limite_usuarios_basico",
        "valor": 5,
        "descricao": "Máximo de funcionários ativos permitidos no plano Básico.",
        "tipo": "int",
        "categoria": "Limites SaaS",
        "ambiente": "todos",
    },
    {
        "chave": "limite_usuarios_premium",
        "valor": 25,
        "descricao": "Máximo de funcionários ativos permitidos no plano Premium.",
        "tipo": "int",
        "categoria": "Limites SaaS",
        "ambiente": "todos",
    },
    {
        "chave": "bloquear_ao_atingir_limite_usuarios",
        "valor": True,
        "descricao": "Quando ativo, impede criar funcionário além do limite do plano.",
        "tipo": "bool",
        "categoria": "Limites SaaS",
        "ambiente": "todos",
    },

    # Ordens de Serviço por mês — controla volume operacional
    {
        "chave": "limite_os_mensal_basico",
        "valor": 100,
        "descricao": "Máximo de O.S. criadas por mês no plano Básico.",
        "tipo": "int",
        "categoria": "Limites SaaS",
        "ambiente": "todos",
    },
    {
        "chave": "limite_os_mensal_premium",
        "valor": 1000,
        "descricao": "Máximo de O.S. criadas por mês no plano Premium.",
        "tipo": "int",
        "categoria": "Limites SaaS",
        "ambiente": "todos",
    },
    {
        "chave": "bloquear_ao_atingir_limite_os",
        "valor": True,
        "descricao": "Quando ativo, impede criar nova O.S. ao estourar a quota mensal.",
        "tipo": "bool",
        "categoria": "Limites SaaS",
        "ambiente": "todos",
    },

    # Armazenamento (anexos: documentos da OS, logo da oficina) em MB
    {
        "chave": "limite_storage_mb_basico",
        "valor": 1024,        # 1 GB
        "descricao": "Cota de armazenamento (MB) no plano Básico.",
        "tipo": "int",
        "categoria": "Limites SaaS",
        "ambiente": "todos",
    },
    {
        "chave": "limite_storage_mb_premium",
        "valor": 10240,       # 10 GB
        "descricao": "Cota de armazenamento (MB) no plano Premium.",
        "tipo": "int",
        "categoria": "Limites SaaS",
        "ambiente": "todos",
    },
    {
        "chave": "bloquear_ao_atingir_limite_storage",
        "valor": True,
        "descricao": "Quando ativo, impede uploads que estourem a cota.",
        "tipo": "bool",
        "categoria": "Limites SaaS",
        "ambiente": "todos",
    },

    # ---- Limites de upload por arquivo (anexos da OS) ----
    # Diferente da cota TOTAL de storage: este é o limite POR ARQUIVO,
    # aplicado no momento do upload. Protege contra usuário subir um vídeo
    # de 500 MB por engano (que seria aceito pela cota mas é inutilizável).
    {
        "chave": "upload_os_tamanho_max_mb",
        "valor": 10,
        "descricao": "Tamanho máximo (MB) por arquivo anexado em uma O.S.",
        "tipo": "int",
        "categoria": "Uploads",
        "ambiente": "todos",
    },
    {
        "chave": "upload_os_tipos_permitidos",
        "valor": [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
            "text/csv",
        ],
        "descricao": (
            "Tipos MIME aceitos no upload de documentos da O.S. "
            "Lista vazia = qualquer tipo (não recomendado)."
        ),
        "tipo": "json",
        "categoria": "Uploads",
        "ambiente": "todos",
    },
    {
        "chave": "upload_os_extensoes_permitidas",
        "valor": [
            "jpg", "jpeg", "png", "webp", "gif",
            "pdf", "doc", "docx", "xls", "xlsx", "txt", "csv",
        ],
        "descricao": (
            "Extensões aceitas (fallback quando o navegador não envia MIME). "
            "Comparação case-insensitive."
        ),
        "tipo": "json",
        "categoria": "Uploads",
        "ambiente": "todos",
    },
]


# Mapa por chave para metadados (consultado pela UI).
SEED_INDEX = {item["chave"]: item for item in _SEED_DEFAULT}


def aplicar_seed_inicial():
    """Idempotente — só cria chaves que ainda não existem."""
    existentes = set(ConfiguracaoGlobal.objects.values_list("chave", flat=True))
    for item in _SEED_DEFAULT:
        if item["chave"] in existentes:
            continue
        ConfiguracaoGlobal.objects.create(
            chave=item["chave"],
            valor=item["valor"],
            descricao=item["descricao"],
        )


def listar_configuracoes():
    """Lista configurações com metadados (tipo/categoria) anexados.

    Retorna instâncias do modelo, mas anexa `_meta_tipo` e `_meta_categoria`
    para o serializer apresentar à UI.
    """
    aplicar_seed_inicial()
    qs = list(ConfiguracaoGlobal.objects.all().order_by("chave"))
    for cfg in qs:
        meta = SEED_INDEX.get(cfg.chave, {})
        cfg._meta_tipo = meta.get("tipo", "json")
        cfg._meta_categoria = meta.get("categoria", "Outros")
        cfg._meta_ambiente = meta.get("ambiente", "todos")
    return qs


def _normalizar_valor(chave, valor):
    """Coage valor segundo o tipo declarado nos metadados do seed."""
    tipo = SEED_INDEX.get(chave, {}).get("tipo", "json")
    if valor is None:
        return None
    if tipo == "bool":
        if isinstance(valor, bool):
            return valor
        if isinstance(valor, str):
            return valor.strip().lower() in ("1", "true", "sim", "on", "yes")
        return bool(valor)
    if tipo == "int":
        try:
            return int(valor)
        except (TypeError, ValueError):
            raise ValueError(f"Valor inválido para '{chave}': esperado inteiro.")
    if tipo in ("str", "url"):
        return str(valor)
    return valor


def atualizar_configuracao(request, chave, valor):
    """Atualiza/cria uma configuração e registra auditoria."""
    if not chave:
        raise ValueError("Informe a chave da configuração.")
    valor_normalizado = _normalizar_valor(chave, valor)
    config = ConfiguracaoGlobal.definir(
        chave=chave, valor=valor_normalizado, usuario=request.user
    )

    # Invalida cache local para que próximos `obter_flag` leiam do banco
    invalidar_cache(chave)

    registrar_auditoria(
        request,
        acao="configuracao.atualizar",
        recurso="configuracao",
        recurso_id=chave,
        nivel="warning",
        descricao=f"Configuração '{chave}' atualizada.",
        metadados={"valor": valor_normalizado},
    )
    return config


def obter_flag(chave, default=None):
    """Lê uma flag com cache de processo + fallback para o seed.

    Ordem de resolução:
      1. cache local (se a chave ainda é válida)
      2. banco (ConfiguracaoGlobal.obter)
      3. valor default do seed
      4. argumento `default`
    """
    with _CACHE_LOCK:
        if chave in _CACHE_FLAGS:
            return _CACHE_FLAGS[chave]
    valor = ConfiguracaoGlobal.obter(chave, default=None)
    if valor is None:
        valor = SEED_INDEX.get(chave, {}).get("valor", default)
    with _CACHE_LOCK:
        _CACHE_FLAGS[chave] = valor
    return valor


def invalidar_cache(chave=None):
    """Limpa o cache local. Use `chave=None` para zerar tudo."""
    with _CACHE_LOCK:
        if chave is None:
            _CACHE_FLAGS.clear()
        else:
            _CACHE_FLAGS.pop(chave, None)
