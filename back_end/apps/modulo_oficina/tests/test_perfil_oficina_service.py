"""Testes do perfil_oficina_service.

Cobre montagem do payload de leitura, atualização parcial e a criação
inicial da oficina (com vinculação do usuário como administrador).
"""
from datetime import time

import pytest

from apps.modulo_oficina.models import Funcionario, Oficina
from apps.modulo_oficina.services import (
    atualizar_perfil_oficina,
    criar_oficina_e_vincular_admin,
    montar_payload_perfil,
)


pytestmark = pytest.mark.django_db


class TestMontarPayloadPerfil:
    def test_estrutura_basica_do_payload(self, oficina):
        payload = montar_payload_perfil(oficina)

        # Top-level: agrupamento por seção
        assert "dadosBasicos" in payload
        assert "endereco" in payload
        assert "horarios" in payload
        assert "plano" in payload
        assert "historico" in payload
        assert "status" in payload
        assert "aberto_agora" in payload

    def test_dados_basicos_refletem_a_oficina(self, oficina):
        payload = montar_payload_perfil(oficina)
        assert payload["dadosBasicos"]["nome"] == oficina.nome
        assert payload["dadosBasicos"]["cnpj"] == oficina.cnpj
        assert payload["dadosBasicos"]["especialidade"] == oficina.especialidade

    def test_horarios_em_formato_HH_MM(self, oficina):
        payload = montar_payload_perfil(oficina)
        assert payload["horarios"]["abertura"] == "08:00"
        assert payload["horarios"]["fechamento"] == "18:00"
        assert payload["horarios"]["diasFuncionamento"] == oficina.dias_funcionamento

    def test_aberto_agora_eh_booleano(self, oficina):
        payload = montar_payload_perfil(oficina)
        assert isinstance(payload["aberto_agora"], bool)


class TestAtualizarPerfilOficina:
    def test_atualiza_dados_basicos(self, oficina):
        dados = {
            "dadosBasicos": {
                "nome": "Pit Stop Premium",
                "email": "novo@oficina.test",
                "telefone": "(11) 4000-9999",
                "especialidade": "eletrica",
            },
        }

        atualizar_perfil_oficina(oficina, dados)
        oficina.refresh_from_db()

        assert oficina.nome == "Pit Stop Premium"
        assert oficina.email == "novo@oficina.test"
        assert oficina.telefone == "(11) 4000-9999"
        assert oficina.especialidade == "eletrica"

    def test_atualiza_endereco(self, oficina):
        dados = {
            "endereco": {
                "cep": "01310-100",
                "logradouro": "Av. Paulista",
                "numero": "1000",
                "bairro": "Bela Vista",
                "cidade": "São Paulo",
                "estado": "SP",
            }
        }

        atualizar_perfil_oficina(oficina, dados)
        oficina.refresh_from_db()

        assert oficina.cep == "01310-100"
        assert oficina.logradouro == "Av. Paulista"
        assert oficina.cidade == "São Paulo"

    def test_atualiza_horarios_a_partir_de_strings(self, oficina):
        dados = {
            "horarios": {
                "abertura": "07:30",
                "fechamento": "19:00",
                "diasFuncionamento": ["seg", "ter", "qua", "qui", "sex", "sab"],
            }
        }

        atualizar_perfil_oficina(oficina, dados)
        oficina.refresh_from_db()

        assert oficina.horario_abertura == time(7, 30)
        assert oficina.horario_fechamento == time(19, 0)
        assert "sab" in oficina.dias_funcionamento

    def test_aceita_diasFuncionamento_como_string_json(self, oficina):
        dados = {
            "horarios": {
                "diasFuncionamento": '["seg","qua","sex"]',
            }
        }

        atualizar_perfil_oficina(oficina, dados)
        oficina.refresh_from_db()

        assert oficina.dias_funcionamento == ["seg", "qua", "sex"]

    def test_atualizacao_parcial_preserva_campos_nao_enviados(self, oficina):
        nome_antes = oficina.nome
        cnpj_antes = oficina.cnpj

        atualizar_perfil_oficina(oficina, {"endereco": {"cidade": "Campinas"}})
        oficina.refresh_from_db()

        # Atualizou cidade
        assert oficina.cidade == "Campinas"
        # Mas preservou os demais
        assert oficina.nome == nome_antes
        assert oficina.cnpj == cnpj_antes


class TestCriarOficinaEVincularAdmin:
    def _dados_minimos(self):
        return {
            "nome": "Pit Stop Norte",
            "cnpj": "98.765.432/0001-11",
            "email": "norte@oficina.test",
            "telefone": "(11) 5000-0000",
            "especialidade": "geral",
            "horario_abertura": "08:00",
            "horario_fechamento": "18:00",
            "dias_funcionamento": '["seg","ter","qua"]',
            "cep": "02000-000",
            "logradouro": "Rua Norte",
            "numero": "10",
            "bairro": "Centro",
            "cidade": "São Paulo",
            "estado": "SP",
            "plano": "premium",
        }

    def test_cria_oficina_com_dados_informados(self, db):
        oficina = criar_oficina_e_vincular_admin(self._dados_minimos())

        assert isinstance(oficina, Oficina)
        assert oficina.nome == "Pit Stop Norte"
        assert oficina.plano_atual == "premium"
        assert oficina.dias_funcionamento == ["seg", "ter", "qua"]

    def test_horarios_sao_convertidos_corretamente(self, db):
        oficina = criar_oficina_e_vincular_admin(self._dados_minimos())

        assert oficina.horario_abertura == time(8, 0)
        assert oficina.horario_fechamento == time(18, 0)

    def test_vincula_usuario_autenticado_como_admin(self, db, user):
        oficina = criar_oficina_e_vincular_admin(self._dados_minimos(), usuario=user)

        funcionario = Funcionario.objects.get(user=user)
        assert funcionario.oficina == oficina
        assert funcionario.permissao == "admin"
        assert funcionario.is_active is True

    def test_nao_cria_funcionario_quando_usuario_anonimo(self, db):
        from django.contrib.auth.models import AnonymousUser
        criar_oficina_e_vincular_admin(self._dados_minimos(), usuario=AnonymousUser())

        assert Funcionario.objects.count() == 0
