"""Testes do `AbacatePayClient` — sem rede de verdade."""
from unittest.mock import MagicMock, patch

import pytest
from django.test import override_settings

from apps.modulo_pagamentos.services.abacatepay_client import (
    AbacatePayAPIError,
    AbacatePayClient,
    AbacatePayConfigError,
    CheckoutCriado,
)


def _fake_response(status_code=200, json_payload=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_payload if json_payload is not None else {}
    resp.text = ""
    return resp


@pytest.mark.unit
@override_settings(ABACATEPAY_API_KEY="")
def test_falta_chave_levanta_config_error():
    # Sem chave nem no construtor nem no settings -> erro claro de configuração.
    with pytest.raises(AbacatePayConfigError):
        AbacatePayClient(api_key="")


@pytest.mark.unit
def test_dev_mode_detectado_pelo_prefixo():
    c = AbacatePayClient(api_key="abc_dev_qualquercoisa")
    assert c.is_dev_mode is True
    c2 = AbacatePayClient(api_key="abc_live_xyz")
    assert c2.is_dev_mode is False


@pytest.mark.unit
def test_metodos_filtrados_para_api_v1():
    """O endpoint /v1/billing/create aceita apenas PIX e CARD.

    BOLETO é aceito no domínio interno mas filtrado antes de enviar.
    """
    c = AbacatePayClient(api_key="abc_dev_xx")
    assert c._filtrar_metodos_para_api(None) == ["PIX", "CARD"]
    assert c._filtrar_metodos_para_api(["pix", "card"]) == ["PIX", "CARD"]
    assert c._filtrar_metodos_para_api(["PIX", "PIX"]) == ["PIX"]  # dedup
    # BOLETO é silenciosamente removido (não suportado pelo endpoint v1)
    assert c._filtrar_metodos_para_api(["PIX", "BOLETO"]) == ["PIX"]
    with pytest.raises(ValueError):
        c._filtrar_metodos_para_api(["DOGE"])


@pytest.mark.unit
def test_payload_cliente_so_quando_completo_e_valido():
    f = AbacatePayClient._payload_cliente
    # Tudo válido: telefone normalizado, taxId com dígitos verificadores OK
    completo = f("Maria", "maria@example.com", "(11) 99999-1234", "111.444.777-35")
    assert completo == {
        "name": "Maria",
        "email": "maria@example.com",
        "cellphone": "+5511999991234",
        "taxId": "11144477735",
    }
    # Falta campo: omite o objeto inteiro
    assert f("Maria", None, "11999", "11144477735") is None
    # Email inválido: omite (a API exige email válido)
    assert f("Maria", "nao-e-email", "11999991234", "11144477735") is None
    # CPF com dígitos verificadores errados: omite
    assert f("Maria", "maria@example.com", "11999991234", "12345678900") is None


@pytest.mark.unit
def test_criar_checkout_v2_com_cliente_dispara_tres_posts_e_usa_customer_id():
    """Fluxo completo: produto + customer + checkout, vinculando via customerId.

    Enviar customer inline no /v2/checkouts/create faz a AbacatePay
    aceitar mas não associar o cliente — quebra a simulação de pagamento.
    Por isso o client cria o customer via /v2/customers/create e vincula
    via customerId.
    """
    produto_resp = {
        "data": {"id": "prod_abc123", "externalId": "uuid-X", "price": 19900},
        "success": True, "error": None,
    }
    customer_resp = {
        "data": {"id": "cust_zzz", "name": "Cliente Teste"},
        "success": True, "error": None,
    }
    checkout_resp = {
        "data": {
            "id": "bill_xyz",
            "url": "https://app.abacatepay.com/pay/bill_xyz",
            "amount": 19900,
            "status": "PENDING",
            "customerId": "cust_zzz",
        },
        "success": True, "error": None,
    }
    respostas = [
        _fake_response(200, produto_resp),
        _fake_response(200, customer_resp),
        _fake_response(200, checkout_resp),
    ]

    with patch(
        "apps.modulo_pagamentos.services.abacatepay_client.requests.post",
        side_effect=respostas,
    ) as mock_post:
        c = AbacatePayClient(api_key="abc_dev_xx")
        resultado = c.criar_checkout(
            valor_centavos=19900,
            descricao="Assinatura Premium",
            external_id="11111111-1111-1111-1111-111111111111",
            return_url="https://app.local/retorno",
            completion_url="https://app.local/sucesso",
            metodos=["PIX", "CARD", "BOLETO"],  # BOLETO filtrado
            cliente_nome="Cliente Teste",
            cliente_email="cliente@example.com",
            cliente_telefone="(11) 99999-1234",
            cliente_cpf_cnpj="111.444.777-35",
        )

    assert isinstance(resultado, CheckoutCriado)
    assert resultado.id == "bill_xyz"

    # 3 POSTs: produto + customer + checkout
    assert mock_post.call_count == 3
    args_produto, kwargs_produto = mock_post.call_args_list[0]
    args_customer, kwargs_customer = mock_post.call_args_list[1]
    args_checkout, kwargs_checkout = mock_post.call_args_list[2]

    assert args_produto[0].endswith("/v2/products/create")
    assert kwargs_produto["json"]["currency"] == "BRL"

    assert args_customer[0].endswith("/v2/customers/create")
    customer = kwargs_customer["json"]
    assert customer["taxId"] == "11144477735"
    assert customer["cellphone"] == "+5511999991234"
    assert customer["externalId"].startswith("customer-")

    assert args_checkout[0].endswith("/v2/checkouts/create")
    checkout = kwargs_checkout["json"]
    assert checkout["items"] == [{"id": "prod_abc123", "quantity": 1}]
    assert checkout["methods"] == ["PIX", "CARD"]  # BOLETO removido
    assert checkout["externalId"] == "11111111-1111-1111-1111-111111111111"
    # customerId é o jeito correto de vincular cliente ao checkout
    assert checkout["customerId"] == "cust_zzz"
    assert "customer" not in checkout  # nunca enviamos inline
    headers = kwargs_checkout["headers"]
    assert headers["Authorization"] == "Bearer abc_dev_xx"


@pytest.mark.unit
def test_dev_mode_aplica_fallback_quando_dados_da_oficina_invalidos():
    """Em dev mode, sem dados válidos, usa customer de sandbox para
    destravar a simulação na página de checkout do AbacatePay."""
    respostas = [
        _fake_response(200, {"data": {"id": "prod_x"}, "success": True}),
        _fake_response(200, {"data": {"id": "cust_sandbox"}, "success": True}),
        _fake_response(200, {
            "data": {"id": "bill_y", "url": "https://u", "amount": 100, "status": "PENDING"},
            "success": True,
        }),
    ]
    with patch(
        "apps.modulo_pagamentos.services.abacatepay_client.requests.post",
        side_effect=respostas,
    ) as mock_post:
        c = AbacatePayClient(api_key="abc_dev_xx")  # is_dev_mode=True
        c.criar_checkout(
            valor_centavos=19900, descricao="x",
            external_id="22222222-2222-2222-2222-222222222222",
            return_url="https://r/", completion_url="https://c/",
            # Sem dados de cliente — fallback de sandbox é aplicado
        )
    assert mock_post.call_count == 3  # produto + customer fallback + checkout
    _, kwargs_customer = mock_post.call_args_list[1]
    fallback = kwargs_customer["json"]
    assert fallback["taxId"] == "11144477735"  # CPF de teste oficial
    assert fallback["email"] == "sandbox@pitstop.demo"
    _, kwargs_checkout = mock_post.call_args_list[2]
    assert kwargs_checkout["json"]["customerId"] == "cust_sandbox"


@pytest.mark.unit
def test_prod_sem_dados_de_cliente_segue_sem_customer():
    """Em produção (abc_live_*), NÃO aplicamos fallback de sandbox —
    o pagador preenche os dados na página de checkout."""
    respostas = [
        _fake_response(200, {"data": {"id": "prod_x"}, "success": True}),
        _fake_response(200, {
            "data": {"id": "bill_y", "url": "https://u", "amount": 100, "status": "PENDING"},
            "success": True,
        }),
    ]
    with patch(
        "apps.modulo_pagamentos.services.abacatepay_client.requests.post",
        side_effect=respostas,
    ) as mock_post:
        c = AbacatePayClient(api_key="abc_live_xx")  # is_dev_mode=False
        c.criar_checkout(
            valor_centavos=19900, descricao="x",
            external_id="33333333-3333-3333-3333-333333333333",
            return_url="https://r/", completion_url="https://c/",
        )
    assert mock_post.call_count == 2  # apenas produto + checkout
    _, kwargs_checkout = mock_post.call_args_list[1]
    assert "customerId" not in kwargs_checkout["json"]


@pytest.mark.unit
def test_falha_no_customer_nao_bloqueia_checkout():
    """Se /v2/customers/create devolve 4xx, seguimos sem customer."""
    respostas = [
        _fake_response(200, {"data": {"id": "prod_x"}, "success": True}),
        _fake_response(400, {"success": False, "error": "campo X inválido"}),
        _fake_response(200, {
            "data": {"id": "bill_y", "url": "https://u", "amount": 100, "status": "PENDING"},
            "success": True,
        }),
    ]
    with patch(
        "apps.modulo_pagamentos.services.abacatepay_client.requests.post",
        side_effect=respostas,
    ) as mock_post:
        c = AbacatePayClient(api_key="abc_dev_xx")
        resultado = c.criar_checkout(
            valor_centavos=19900, descricao="x",
            external_id="33333333-3333-3333-3333-333333333333",
            return_url="https://r/", completion_url="https://c/",
            cliente_nome="Maria",
            cliente_email="m@m.com",
            cliente_telefone="11999991234",
            cliente_cpf_cnpj="11144477735",
        )
    assert resultado.id == "bill_y"
    # 3 chamadas: produto + customer (falha) + checkout (sem customerId)
    assert mock_post.call_count == 3
    _, kwargs_checkout = mock_post.call_args_list[2]
    assert "customerId" not in kwargs_checkout["json"]


@pytest.mark.unit
def test_erro_http_no_passo_de_produto_levanta_api_error():
    """Se /v2/products/create falhar, o checkout nem é tentado."""
    payload = {"success": False, "error": "Bad request"}
    with patch(
        "apps.modulo_pagamentos.services.abacatepay_client.requests.post",
        return_value=_fake_response(400, payload),
    ) as mock_post:
        c = AbacatePayClient(api_key="abc_dev_xx")
        with pytest.raises(AbacatePayAPIError) as exc:
            c.criar_checkout(
                valor_centavos=100, descricao="x", external_id="e",
                return_url="https://r/", completion_url="https://c/",
            )
        assert exc.value.status_code == 400
        # Apenas um POST aconteceu (o de produto); checkout não foi chamado.
        assert mock_post.call_count == 1


@pytest.mark.unit
def test_falha_de_transporte_vira_api_error():
    import requests
    with patch(
        "apps.modulo_pagamentos.services.abacatepay_client.requests.post",
        side_effect=requests.ConnectionError("offline"),
    ):
        c = AbacatePayClient(api_key="abc_dev_xx")
        with pytest.raises(AbacatePayAPIError, match="Falha de conexão"):
            c.criar_checkout(
                valor_centavos=100, descricao="x", external_id="e",
                return_url="https://r/", completion_url="https://c/",
            )


@pytest.mark.unit
def test_validacoes_de_input():
    c = AbacatePayClient(api_key="abc_dev_xx")
    # AbacatePay exige price >= 100 centavos
    with pytest.raises(ValueError, match="Valor mínimo"):
        c.criar_checkout(
            valor_centavos=50, descricao="x", external_id="e",
            return_url="https://r/", completion_url="https://c/",
        )
    with pytest.raises(ValueError):
        c.criar_checkout(
            valor_centavos=100, descricao="x", external_id="",
            return_url="https://r/", completion_url="https://c/",
        )
    with pytest.raises(ValueError):
        c.criar_checkout(
            valor_centavos=100, descricao="x", external_id="e",
            return_url="", completion_url="https://c/",
        )


@pytest.mark.unit
def test_apenas_boleto_falha_porque_nao_eh_suportado():
    """Se o usuário pedir SOMENTE BOLETO, devolvemos erro claro
    (em vez de mandar lista vazia ao AbacatePay)."""
    c = AbacatePayClient(api_key="abc_dev_xx")
    with pytest.raises(ValueError, match="Nenhum método aceito"):
        c.criar_checkout(
            valor_centavos=100, descricao="x", external_id="e",
            return_url="https://r/", completion_url="https://c/",
            metodos=["BOLETO"],
        )


@pytest.mark.unit
def test_normalizacao_de_telefone_e_taxid():
    f = AbacatePayClient._payload_cliente
    # CPF válido + telefone sem DDI → prepende +55
    r = f("Maria", "m@m.com", "(11) 99999-1234", "111.444.777-35")
    assert r["cellphone"] == "+5511999991234"
    # Telefone já com DDI: respeita
    r2 = f("Maria", "m@m.com", "+5511999991234", "11144477735")
    assert r2["cellphone"] == "+5511999991234"
    # taxId só dígitos
    assert r2["taxId"] == "11144477735"


@pytest.mark.unit
def test_validacao_cpf_cnpj_descarta_customer_invalido():
    from apps.modulo_pagamentos.services.abacatepay_client import (
        _cpf_valido, _cnpj_valido, _tax_id_valido,
    )
    # CPF — válidos
    assert _cpf_valido("11144477735") is True
    assert _cpf_valido("52998224725") is True
    # CPF — inválidos
    assert _cpf_valido("12345678900") is False  # dígitos verificadores errados
    assert _cpf_valido("11111111111") is False  # todos repetidos
    assert _cpf_valido("123") is False
    # CNPJ — válidos
    assert _cnpj_valido("11222333000181") is True
    # CNPJ — inválidos
    assert _cnpj_valido("12345678000199") is False
    assert _cnpj_valido("00000000000000") is False
    # _tax_id_valido aceita CPF OU CNPJ válidos
    assert _tax_id_valido("11144477735") is True
    assert _tax_id_valido("11222333000181") is True
    assert _tax_id_valido("12345") is False


@pytest.mark.unit
def test_mensagem_usuario_amigavel_para_erros_conhecidos():
    from apps.modulo_pagamentos.services.abacatepay_client import (
        _humanizar_erro_abacate,
    )
    assert "incompatível" in _humanizar_erro_abacate("API key version mismatch", None).lower()
    assert "e-mail" in _humanizar_erro_abacate("Property 'customer.email' should be email", None).lower()
    assert "Falha no AbacatePay" in _humanizar_erro_abacate("Algum erro novo", None)
