"""Fixtures globais aplicadas a todos os testes do projeto.

`_limpa_cache_seg` é autouse para evitar que contadores do
SegurancaMiddleware (contagem de 4xx por IP, lockouts, rate limits)
vazem de um teste para o outro — o que tornaria os testes flaky.

`_paywall_off_por_padrao` desativa o middleware de paywall (introduzido
pelo modulo_pagamentos) para que a suíte legada continue passando sem
precisar criar AssinaturaOficina ativa em cada fixture de oficina. Os
testes que validam o paywall propriamente dito usam
`@override_settings(PAGAMENTOS_PAYWALL_HABILITADO=True)`.
"""
import pytest
from django.core.cache import cache
from django.test import override_settings


@pytest.fixture(autouse=True)
def _limpa_cache_seg():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _paywall_off_por_padrao():
    with override_settings(PAGAMENTOS_PAYWALL_HABILITADO=False):
        yield
