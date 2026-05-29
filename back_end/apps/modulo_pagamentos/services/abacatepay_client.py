"""Cliente HTTP para a API do AbacatePay.

Encapsula as chamadas REST que o sistema precisa (criar cobrança,
consultar status) num adaptador testável. O resto do código nunca
deve falar HTTP direto: sempre passa por aqui.

Fluxo (API v2 da AbacatePay):
  1. POST /v2/products/create — cria/registra o produto que será cobrado
     (idempotente por `externalId`).
  2. POST /v2/checkouts/create — gera o link de pagamento referenciando
     o `id` do produto criado.

A AbacatePay devolve uma `url` que abrimos para o pagador escolher PIX
ou Cartão de Crédito. Em modo dev (chave `abc_dev_*`) tudo é simulado.

Notas importantes:
  - O endpoint /v2 só aceita `methods` ∈ {PIX, CARD}. BOLETO ainda não
    consta no enum; mantemos no domínio interno mas filtramos antes da
    requisição (anotando log de aviso).
  - Não existe SDK oficial Python; usamos `requests`.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Iterable, Optional

import requests
from django.conf import settings


logger = logging.getLogger(__name__)

_TIMEOUT_PADRAO = 15  # segundos
_USER_AGENT = "PitStop/1.0 (+https://pitstop.local)"

METODOS_ACEITOS_API = ("PIX", "CARD")   # enum do /v2/checkouts/create
METODOS_DOMINIO = ("PIX", "CARD", "BOLETO")  # aceitos internamente

_PRICE_MIN_CENTAVOS = 100  # mínimo aceito pelo AbacatePay (R$ 1,00)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Dados de fallback usados APENAS em dev mode para destravar a simulação
# na página de checkout da AbacatePay. CPF 111.444.777-35 é o exemplo
# da própria documentação. Em produção (chave abc_live_*) esse fallback
# nunca é aplicado — usamos os dados reais ou omitimos o customer.
_FALLBACK_DEV_CUSTOMER = {
    "name": "Cliente Pit Stop (sandbox)",
    "email": "sandbox@pitstop.demo",
    "cellphone": "+5511999990000",
    "taxId": "11144477735",
}


def _cpf_valido(digitos: str) -> bool:
    """Validação de CPF pelos dígitos verificadores (11 dígitos, não-repetidos)."""
    if len(digitos) != 11 or digitos == digitos[0] * 11:
        return False
    for i in range(9, 11):
        soma = sum(int(digitos[j]) * ((i + 1) - j) for j in range(i))
        dig = (soma * 10) % 11
        if dig == 10:
            dig = 0
        if dig != int(digitos[i]):
            return False
    return True


def _cnpj_valido(digitos: str) -> bool:
    """Validação de CNPJ pelos dígitos verificadores (14 dígitos)."""
    if len(digitos) != 14 or digitos == digitos[0] * 14:
        return False
    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    pesos2 = [6] + pesos1
    for pesos in (pesos1, pesos2):
        n = len(pesos)
        soma = sum(int(digitos[i]) * pesos[i] for i in range(n))
        dig = soma % 11
        dig = 0 if dig < 2 else 11 - dig
        if dig != int(digitos[n]):
            return False
    return True


def _tax_id_valido(digitos: str) -> bool:
    """True se for CPF (11) ou CNPJ (14) com dígitos verificadores válidos."""
    if len(digitos) == 11:
        return _cpf_valido(digitos)
    if len(digitos) == 14:
        return _cnpj_valido(digitos)
    return False


# ---------------------------------------------------------------------------
# Exceções
# ---------------------------------------------------------------------------

class AbacatePayError(Exception):
    """Erro genérico de integração com o AbacatePay."""


class AbacatePayConfigError(AbacatePayError):
    """Configuração ausente/inválida (ex.: ABACATEPAY_API_KEY não definida)."""


class AbacatePayAPIError(AbacatePayError):
    """A API respondeu com erro (status >= 400 ou success=false).

    `mensagem_usuario` é o texto curto e amigável que pode ser propagado
    ao front sem expor detalhes técnicos.
    """

    def __init__(self, message: str, status_code: int = 0, payload=None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload
        self.mensagem_usuario = _humanizar_erro_abacate(message, payload)


# ---------------------------------------------------------------------------
# DTO retornado por criar_cobranca
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CheckoutCriado:
    """Resultado normalizado de POST /v2/checkouts/create."""

    id: str
    url: str
    amount_centavos: int
    status: str
    raw: dict


# ---------------------------------------------------------------------------
# Cliente
# ---------------------------------------------------------------------------

class AbacatePayClient:
    """Adaptador HTTP do AbacatePay (stateless além das credenciais)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: int = _TIMEOUT_PADRAO,
    ):
        self.api_key = api_key or getattr(settings, "ABACATEPAY_API_KEY", "") or ""
        self.base_url = (
            base_url
            or getattr(settings, "ABACATEPAY_BASE_URL", "https://api.abacatepay.com")
        ).rstrip("/")
        self.timeout = timeout
        if not self.api_key:
            raise AbacatePayConfigError(
                "ABACATEPAY_API_KEY não configurada. Defina no .env antes de "
                "chamar a API de pagamentos."
            )

    @property
    def is_dev_mode(self) -> bool:
        """True quando a chave indica ambiente de simulação."""
        return self.api_key.startswith("abc_dev_")

    # --------------------------- Operações públicas ----------------------------

    def criar_checkout(
        self,
        *,
        valor_centavos: int,
        descricao: str,
        external_id: str,
        return_url: str,
        completion_url: str,
        metodos: Optional[Iterable[str]] = None,
        cliente_nome: Optional[str] = None,
        cliente_email: Optional[str] = None,
        cliente_telefone: Optional[str] = None,
        cliente_cpf_cnpj: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> CheckoutCriado:
        """Cria uma cobrança (PIX/Cartão) e devolve a URL para o pagador.

        Faz até três chamadas à API:
          1. POST /v2/customers/create  (idempotente por externalId; só
             quando temos dados completos e válidos do pagador)
          2. POST /v2/products/create   (produto avulso por cobrança)
          3. POST /v2/checkouts/create  (gera a URL pública)

        Importante: o `customer` precisa ser pré-cadastrado e vinculado
        ao checkout via `customerId`. Enviar `customer` inline ao
        /v2/checkouts/create faz o AbacatePay aceitar a chamada mas NÃO
        associar o cliente — o que quebra a "Simular pagamento" no painel
        ("Tivemos um problema ao tentar processar o seu pagamento").

        - `valor_centavos` ≥ 100 (regra do AbacatePay).
        - `external_id`: UUID do `Pagamento` interno; reusado como
          externalId do produto E do checkout para reconciliação.
        - `metodos`: subset de {PIX, CARD, BOLETO}; BOLETO é filtrado
          antes de enviar (o endpoint v2 não suporta).
        - Campos de cliente só são incluídos se TODOS válidos
          (incluindo dígitos verificadores do CPF/CNPJ).
        """
        if int(valor_centavos) < _PRICE_MIN_CENTAVOS:
            raise ValueError(
                f"Valor mínimo do AbacatePay é R$ {_PRICE_MIN_CENTAVOS/100:.2f} "
                f"({_PRICE_MIN_CENTAVOS} centavos)."
            )
        if not external_id:
            raise ValueError("external_id obrigatório (use o UUID do Pagamento).")
        if not return_url or not completion_url:
            raise ValueError("return_url e completion_url são obrigatórios.")

        metodos_api = self._filtrar_metodos_para_api(metodos)
        if not metodos_api:
            raise ValueError(
                "Nenhum método aceito pelo AbacatePay foi selecionado. "
                f"Aceitos pela API: {list(METODOS_ACEITOS_API)}."
            )

        produto = self._criar_ou_obter_produto(
            external_id=external_id,
            nome=descricao or "Pagamento Pit Stop",
            valor_centavos=int(valor_centavos),
        )

        # Tenta cadastrar o cliente para vincular via customerId. Se algum
        # campo é inválido (ou a chamada falha), seguimos sem customer e
        # o pagador preenche na própria página do AbacatePay.
        customer_id = self._criar_customer_se_possivel(
            external_id=external_id,
            nome=cliente_nome,
            email=cliente_email,
            telefone=cliente_telefone,
            cpf_cnpj=cliente_cpf_cnpj,
        )

        payload_checkout: dict = {
            "items": [{"id": produto["id"], "quantity": 1}],
            "externalId": external_id,
            "returnUrl": return_url,
            "completionUrl": completion_url,
            "methods": metodos_api,
        }

        if customer_id:
            payload_checkout["customerId"] = customer_id
        if metadata:
            payload_checkout["metadata"] = metadata

        data = self._post("/v2/checkouts/create", payload_checkout)

        return CheckoutCriado(
            id=str(data.get("id", "")),
            url=str(data.get("url", "")),
            amount_centavos=int(data.get("amount", valor_centavos)),
            status=str(data.get("status", "PENDING")),
            raw=data if isinstance(data, dict) else {"data": data},
        )

    def consultar_checkout(self, abacatepay_id: str) -> dict:
        """Consulta status atual de uma cobrança (polling/sync)."""
        if not abacatepay_id:
            raise ValueError("abacatepay_id obrigatório.")
        return self._get(f"/v2/checkouts/get?id={abacatepay_id}")

    # --------------------------- HTTP interno ---------------------------------

    def _criar_ou_obter_produto(
        self, *, external_id: str, nome: str, valor_centavos: int,
    ) -> dict:
        """Cria um produto avulso e devolve seu dict normalizado.

        A AbacatePay é idempotente por `externalId`: chamar duas vezes
        com o mesmo externalId retorna o produto pré-existente em vez de
        criar duplicata.
        """
        payload = {
            "name": (nome or "Pagamento Pit Stop")[:120],
            "description": (nome or "Pagamento Pit Stop")[:255],
            "price": int(valor_centavos),
            "currency": "BRL",
            "externalId": external_id,
        }
        data = self._post("/v2/products/create", payload)
        if not isinstance(data, dict) or not data.get("id"):
            raise AbacatePayAPIError(
                "Resposta inesperada ao criar produto no AbacatePay.",
                status_code=500, payload=data,
            )
        return data

    def _criar_customer_se_possivel(
        self,
        *,
        external_id: str,
        nome: Optional[str],
        email: Optional[str],
        telefone: Optional[str],
        cpf_cnpj: Optional[str],
    ) -> Optional[str]:
        """Cria um customer no AbacatePay e devolve o `cust_*` ID.

        Estratégia:
          1. Tenta validar dados da oficina. Se passarem, usa eles.
          2. Em dev mode, quando os dados da oficina não passam (CNPJ
             fictício, e-mail vazio, etc.), substitui por dados de
             fallback de sandbox para que a simulação do AbacatePay
             funcione. Em produção, retorna None (sem customer) — o
             pagador preenche na página de checkout.
          3. Se a chamada à API falhar com 4xx, segue sem customer.
        """
        dados = self._payload_cliente(nome, email, telefone, cpf_cnpj)
        if not dados:
            if not self.is_dev_mode:
                return None
            # Dev mode: usar fallback de sandbox pra destravar simulação.
            logger.info(
                "AbacatePay (dev): dados da oficina inválidos — usando customer "
                "de sandbox para que a página de checkout aceite a simulação."
            )
            dados = dict(_FALLBACK_DEV_CUSTOMER)
            if nome:
                # Mantém o nome real se temos — ajuda a identificar no painel.
                dados["name"] = str(nome)[:120]

        # `externalId` ajuda a idempotência: a AbacatePay reutiliza o
        # customer existente se o mesmo externalId for usado de novo.
        payload = {**dados, "externalId": f"customer-{external_id}"}
        try:
            data = self._post("/v2/customers/create", payload)
        except AbacatePayAPIError as exc:
            if exc.status_code and 400 <= exc.status_code < 500:
                logger.warning(
                    "AbacatePay: falha ao criar customer (%s) — seguindo sem ele.",
                    exc,
                )
                return None
            raise
        cust_id = data.get("id") if isinstance(data, dict) else None
        if not cust_id:
            logger.warning(
                "AbacatePay: resposta de /v2/customers/create sem id; seguindo sem customer."
            )
            return None
        return str(cust_id)

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": _USER_AGENT,
        }

    def _post(self, path: str, payload: dict) -> dict:
        url = f"{self.base_url}{path}"
        try:
            resp = requests.post(
                url, json=payload, headers=self._headers(), timeout=self.timeout,
            )
        except requests.RequestException as e:
            logger.exception("AbacatePay POST %s falhou em transporte: %s", path, e)
            raise AbacatePayAPIError(
                f"Falha de conexão ao AbacatePay: {e}", status_code=0, payload=None,
            ) from e
        return self._parse_resposta(resp, path)

    def _get(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        try:
            resp = requests.get(url, headers=self._headers(), timeout=self.timeout)
        except requests.RequestException as e:
            logger.exception("AbacatePay GET %s falhou em transporte: %s", path, e)
            raise AbacatePayAPIError(
                f"Falha de conexão ao AbacatePay: {e}", status_code=0, payload=None,
            ) from e
        return self._parse_resposta(resp, path)

    @staticmethod
    def _parse_resposta(resp: requests.Response, path: str) -> dict:
        try:
            payload = resp.json()
        except ValueError:
            payload = {"raw": resp.text}
        if not isinstance(payload, dict):
            payload = {"data": payload}

        if resp.status_code >= 400 or payload.get("success") is False:
            descricao = (
                payload.get("error")
                or payload.get("message")
                or f"HTTP {resp.status_code}"
            )
            logger.warning(
                "AbacatePay %s respondeu %s: %s | body=%s",
                path, resp.status_code, descricao, resp.text[:500],
            )
            raise AbacatePayAPIError(
                str(descricao), status_code=resp.status_code, payload=payload,
            )

        # API devolve `{data, success, error}`; expomos só `data` quando existe.
        return payload.get("data", payload)

    # --------------------------- Helpers --------------------------------------

    @staticmethod
    def _filtrar_metodos_para_api(metodos: Optional[Iterable[str]]) -> list[str]:
        """Mantém apenas métodos aceitos pelo endpoint atual (PIX, CARD).

        BOLETO no input é registrado como aviso e descartado — se a única
        opção for BOLETO, devolve lista vazia e o caller decide a resposta.
        """
        if not metodos:
            return list(METODOS_ACEITOS_API)
        normalizados: list[str] = []
        for m in metodos:
            mu = str(m).upper().strip()
            if mu in METODOS_ACEITOS_API and mu not in normalizados:
                normalizados.append(mu)
            elif mu == "BOLETO":
                logger.info(
                    "AbacatePay: método BOLETO solicitado mas não suportado "
                    "pelo endpoint v2 — filtrado."
                )
            elif mu not in METODOS_DOMINIO:
                raise ValueError(
                    f"Método de pagamento inválido: {m!r}. "
                    f"Aceitos: {list(METODOS_DOMINIO)}."
                )
        return normalizados

    @classmethod
    def _payload_cliente(cls, nome, email, telefone, cpf_cnpj) -> Optional[dict]:
        """Monta `customer` apenas quando todos os campos estão válidos.

        A AbacatePay exige objeto completo (name, cellphone, email, taxId)
        com email válido E taxId com dígitos verificadores corretos.
        Quando algo falha, omitimos o objeto — a página de checkout pede
        os dados ao pagador na hora (evita o erro genérico "Tivemos um
        problema ao tentar processar o seu pagamento").
        """
        nome_n = (nome or "").strip()
        email_n = (email or "").strip()
        telefone_n = cls._normalizar_telefone(telefone)
        taxid_n = re.sub(r"\D", "", str(cpf_cnpj or ""))

        if not nome_n or not telefone_n or not taxid_n:
            logger.info("AbacatePay: omitindo customer — campos obrigatórios ausentes.")
            return None
        if not _EMAIL_RE.match(email_n):
            logger.info("AbacatePay: omitindo customer — email inválido: %r", email_n)
            return None
        if not _tax_id_valido(taxid_n):
            logger.info(
                "AbacatePay: omitindo customer — CPF/CNPJ inválido (dígitos verificadores)."
            )
            return None
        return {
            "name": nome_n[:120],
            "email": email_n[:120],
            "cellphone": telefone_n,
            "taxId": taxid_n,
        }

    @staticmethod
    def _normalizar_telefone(telefone) -> str:
        """Devolve telefone no formato +55DDDNNNNNNNN ou string vazia."""
        if not telefone:
            return ""
        digitos = re.sub(r"\D", "", str(telefone))
        if not digitos:
            return ""
        if len(digitos) <= 11:
            digitos = "55" + digitos
        return "+" + digitos


# ---------------------------------------------------------------------------
# Tradução de erros para o usuário final
# ---------------------------------------------------------------------------

_TRADUCAO_ERROS = {
    "API key version mismatch": (
        "A chave do AbacatePay está incompatível com o endpoint atual. "
        "Gere uma chave nova no painel da AbacatePay (modo Dev) e atualize "
        "ABACATEPAY_API_KEY no .env."
    ),
    "should be email": (
        "O e-mail informado para a cobrança não é válido. "
        "Atualize o e-mail nos dados da oficina/cliente e tente novamente."
    ),
    "is missing": "Falta uma informação obrigatória para gerar a cobrança.",
    "currency": "Configuração de moeda inválida — contate o suporte.",
}


def _humanizar_erro_abacate(message: str, payload) -> str:
    msg = (message or "").strip()
    if not msg:
        return "Não foi possível processar o pagamento no AbacatePay."
    lower = msg.lower()
    for chave, traducao in _TRADUCAO_ERROS.items():
        if chave.lower() in lower:
            return traducao
    return f"Falha no AbacatePay: {msg}"
