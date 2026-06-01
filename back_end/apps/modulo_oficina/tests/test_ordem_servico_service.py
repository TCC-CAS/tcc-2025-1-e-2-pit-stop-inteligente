"""Testes do ordem_servico_service.

Cobre o fluxo de criação de OS (com upsert de cliente/veículo) e
finalização da OS, garantindo que o histórico é registrado em ambos.
"""
import pytest

from apps.modulo_oficina.models import Cliente, HistoricoOS, OrdemServico, Veiculo
from apps.modulo_oficina.services import criar_os_completa, finalizar_os


pytestmark = pytest.mark.django_db


class TestCriarOSCompleta:
    def _payload_padrao(self):
        return {
            "nome_cliente": "João da Silva",
            "cpf_cnpj": "111.222.333-44",
            "telefone": "(11) 91234-5678",
            "email": "joao@cliente.test",
            "placa": "XYZ9A87",
            "modelo": "Onix",
            "marca": "Chevrolet",
            "ano": "2022",
            "cor": "Branco",
            "chassi": "9BWZZZ377VT004251",
            "tipo_uso": "particular",
            "km_atual": 30000,
        }

    def test_cria_cliente_veiculo_e_os_quando_nenhum_existe(self, oficina):
        os_obj = criar_os_completa(oficina, self._payload_padrao())

        assert isinstance(os_obj, OrdemServico)
        assert os_obj.oficina == oficina
        assert os_obj.status == "pendente"
        assert os_obj.km_atual == 30000

        # Cliente e veículo devem ter sido criados
        assert Cliente.objects.filter(cpf_cnpj="111.222.333-44", oficina=oficina).exists()
        assert Veiculo.objects.filter(placa="XYZ9A87").exists()

    def test_reaproveita_cliente_existente_pelo_cpf_cnpj(self, oficina, cliente):
        payload = self._payload_padrao()
        payload["cpf_cnpj"] = cliente.cpf_cnpj  # mesmo CPF
        payload["nome_cliente"] = "Não importa - cliente já existe"

        os_obj = criar_os_completa(oficina, payload)

        # Não deve criar duplicado
        assert Cliente.objects.filter(cpf_cnpj=cliente.cpf_cnpj, oficina=oficina).count() == 1
        assert os_obj.cliente == cliente

    def test_reaproveita_veiculo_existente_pela_placa(self, oficina, cliente, veiculo):
        payload = self._payload_padrao()
        payload["cpf_cnpj"] = cliente.cpf_cnpj
        payload["placa"] = veiculo.placa

        os_obj = criar_os_completa(oficina, payload)

        # Não deve criar duplicado
        assert Veiculo.objects.filter(placa=veiculo.placa, cliente=cliente).count() == 1
        assert os_obj.veiculo == veiculo

    def test_atualiza_email_do_cliente_quando_fornecido(self, oficina, cliente):
        novo_email = "novo-email@cliente.test"
        payload = self._payload_padrao()
        payload["cpf_cnpj"] = cliente.cpf_cnpj
        payload["email"] = novo_email

        criar_os_completa(oficina, payload)

        cliente.refresh_from_db()
        assert cliente.email == novo_email

    def test_registra_historico_de_criacao(self, oficina):
        os_obj = criar_os_completa(oficina, self._payload_padrao())

        eventos = HistoricoOS.objects.filter(os=os_obj, tipo="criacao")
        assert eventos.count() == 1
        assert eventos.first().descricao == "O.S. Criada"


class TestFinalizarOS:
    def test_marca_status_como_concluido(self, ordem_servico):
        finalizar_os(ordem_servico)

        ordem_servico.refresh_from_db()
        assert ordem_servico.status == "concluido"

    def test_registra_evento_de_conclusao_no_historico(self, ordem_servico):
        finalizar_os(ordem_servico)

        eventos = HistoricoOS.objects.filter(os=ordem_servico, tipo="conclusao")
        assert eventos.count() == 1
        assert eventos.first().descricao == "O.S. Finalizada"
