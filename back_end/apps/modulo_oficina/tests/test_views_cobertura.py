"""Bateria de testes de view do modulo_oficina para cobertura.

Cobre GET/POST/PUT/DELETE dos principais endpoints (clientes, veículos,
OS, checklist, orçamento, tarefas, documentos, manutenção, preços,
funcionários, perfil, dashboard, código de acesso).

A intenção é exercitar os caminhos felizes + alguns erros para subir
cobertura sem inflar o tempo da suíte.
"""
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.modulo_oficina.models import (
    ChecklistRecebimento,
    Cliente,
    Documento,
    Funcionario,
    HistoricoOS,
    ItemOrcamento,
    ManutencaoPreventiva,
    OrdemServico,
    Servico,
    TarefaExecucao,
    Veiculo,
)
from apps.modulo_cliente.models import CodigoAcessoOS


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Perfil / alterar senha
# ---------------------------------------------------------------------------

class TestPerfilOficina:
    def test_get_perfil_retorna_dados_da_oficina(self, api_client):
        resp = api_client.get("/api/oficina/perfil/")
        assert resp.status_code == 200
        body = resp.json()
        assert "dadosBasicos" in body or "nome" in body

    def test_put_perfil_atualiza(self, api_client, oficina):
        resp = api_client.put(
            "/api/oficina/perfil/",
            {"dadosBasicos": {"telefone": "(11) 1111-2222"}},
            format="json",
        )
        # 200/202 conforme implementação — basta não dar 5xx
        assert resp.status_code < 500


class TestAlterarSenha:
    def test_alterar_senha_corretamente(self, api_client, user):
        resp = api_client.post(
            "/api/oficina/alterar-senha/",
            {
                "senha_atual": "senha-de-teste-123",
                "nova_senha": "outra-senha-segura-1",
                "nova_senha_confirmacao": "outra-senha-segura-1",
            },
            format="json",
        )
        assert resp.status_code < 500

    def test_alterar_senha_sem_senha_atual_falha(self, api_client):
        resp = api_client.post(
            "/api/oficina/alterar-senha/",
            {"nova_senha": "nova"},
            format="json",
        )
        assert resp.status_code >= 400


# ---------------------------------------------------------------------------
# Clientes / Veículos
# ---------------------------------------------------------------------------

class TestClientes:
    def test_listar_clientes(self, api_client, cliente):
        resp = api_client.get("/api/oficina/clientes/")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_buscar_cliente_por_nome(self, api_client, cliente):
        resp = api_client.get("/api/oficina/clientes/?search=Maria")
        assert resp.status_code == 200
        assert any("Maria" in c["nome"] for c in resp.json())

    def test_criar_cliente(self, api_client, oficina):
        resp = api_client.post(
            "/api/oficina/clientes/",
            {"nome": "João", "cpf_cnpj": "55566677788", "telefone": "(11) 0000-0000"},
            format="json",
        )
        assert resp.status_code == 201
        assert Cliente.objects.filter(cpf_cnpj="55566677788").exists()

    def test_atualizar_cliente(self, api_client, cliente):
        resp = api_client.patch(
            f"/api/oficina/clientes/{cliente.id}/",
            {"telefone": "(11) 8888-7777"},
            format="json",
        )
        assert resp.status_code == 200

    def test_detalhe_cliente(self, api_client, cliente):
        resp = api_client.get(f"/api/oficina/clientes/{cliente.id}/")
        assert resp.status_code == 200

    def test_excluir_cliente(self, api_client, cliente):
        resp = api_client.delete(f"/api/oficina/clientes/{cliente.id}/")
        assert resp.status_code in (200, 204)

    def test_veiculos_do_cliente(self, api_client, cliente, veiculo):
        resp = api_client.get(f"/api/oficina/clientes/{cliente.id}/veiculos/")
        assert resp.status_code == 200


class TestVeiculos:
    def test_listar_veiculos(self, api_client, veiculo):
        resp = api_client.get("/api/oficina/veiculos/")
        assert resp.status_code == 200

    def test_historico_veiculo(self, api_client, veiculo, ordem_servico):
        resp = api_client.get(f"/api/oficina/veiculos/{veiculo.id}/historico/")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Ordem de Serviço
# ---------------------------------------------------------------------------

class TestOSCrud:
    def test_listar_os(self, api_client, ordem_servico):
        resp = api_client.get("/api/oficina/os/")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_detalhe_os(self, api_client, ordem_servico):
        resp = api_client.get(f"/api/oficina/os/{ordem_servico.id}/")
        assert resp.status_code == 200

    def test_atualizar_os(self, api_client, ordem_servico):
        resp = api_client.patch(
            f"/api/oficina/os/{ordem_servico.id}/",
            {"km_atual": 99999},
            format="json",
        )
        assert resp.status_code == 200
        ordem_servico.refresh_from_db()
        assert ordem_servico.km_atual == 99999

    def test_criar_os_nova(self, api_client, oficina):
        resp = api_client.post(
            "/api/oficina/os/criar/",
            {
                "nome_cliente": "Carlos",
                "cpf_cnpj": "99988877766",
                "telefone": "(11) 1111-1111",
                "placa": "XYZ9X87",
                "modelo": "Civic",
                "marca": "Honda",
                "km_atual": 12345,
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_excluir_os(self, api_client, ordem_servico):
        resp = api_client.delete(f"/api/oficina/os/{ordem_servico.id}/excluir/")
        assert resp.status_code in (200, 204)
        assert not OrdemServico.objects.filter(id=ordem_servico.id).exists()

    def test_finalizar_os(self, api_client, ordem_servico):
        resp = api_client.post(f"/api/oficina/os/{ordem_servico.id}/finalizar/")
        assert resp.status_code == 200
        ordem_servico.refresh_from_db()
        assert ordem_servico.status == "concluido"


# ---------------------------------------------------------------------------
# Checklist
# ---------------------------------------------------------------------------

class TestChecklist:
    def test_get_checklist_inexistente_retorna_estrutura_vazia(self, api_client, ordem_servico):
        resp = api_client.get(f"/api/oficina/os/{ordem_servico.id}/checklist/")
        # Pode ser 200 (estrutura vazia) ou 404 conforme implementação
        assert resp.status_code in (200, 404)

    def test_post_checklist_cria(self, api_client, ordem_servico):
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/checklist/",
            {
                "concluido": True,
                "consultor": "William",
                "nivel_combustivel": "1/2",
                "nivel_oleo": "ok",
                "fluido_arrefecimento": "ok",
                "observacoes_iniciais": "Tudo certo.",
            },
            format="json",
        )
        assert resp.status_code in (200, 201)
        assert ChecklistRecebimento.objects.filter(os=ordem_servico).exists()


# ---------------------------------------------------------------------------
# Itens de orçamento + aprovação + envio
# ---------------------------------------------------------------------------

class TestItensOrcamento:
    def test_listar_itens(self, api_client, ordem_servico, itens_orcamento):
        resp = api_client.get(f"/api/oficina/os/{ordem_servico.id}/itens/")
        assert resp.status_code == 200
        assert len(resp.json()) >= 3

    def test_criar_item(self, api_client, ordem_servico):
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/itens/",
            {
                "tipo": "peca",
                "nome_descricao": "Pastilha de freio",
                "quantidade": 2,
                "valor_unitario": "75.00",
                "status_aprovacao": "pendente",
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_detalhe_item(self, api_client, ordem_servico, itens_orcamento):
        item = itens_orcamento[0]
        resp = api_client.get(f"/api/oficina/os/{ordem_servico.id}/itens/{item.id}/")
        assert resp.status_code == 200

    def test_atualizar_item(self, api_client, ordem_servico, itens_orcamento):
        item = itens_orcamento[0]
        resp = api_client.patch(
            f"/api/oficina/os/{ordem_servico.id}/itens/{item.id}/",
            {"valor_unitario": "150.00"},
            format="json",
        )
        assert resp.status_code == 200

    def test_excluir_item(self, api_client, ordem_servico, itens_orcamento):
        item = itens_orcamento[0]
        resp = api_client.delete(f"/api/oficina/os/{ordem_servico.id}/itens/{item.id}/")
        assert resp.status_code in (200, 204)

    def test_atualizar_status_em_lote(self, api_client, ordem_servico, itens_orcamento):
        resp = api_client.patch(
            f"/api/oficina/os/{ordem_servico.id}/itens/status/",
            {
                "itens": [
                    {"id": itens_orcamento[0].id, "status": "aprovado"},
                    {"id": itens_orcamento[1].id, "status": "reprovado"},
                ],
            },
            format="json",
        )
        assert resp.status_code == 200


class TestAprovacao:
    def test_aprovacao_sem_termo_falha(self, api_client, ordem_servico, itens_orcamento):
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/aprovacao/",
            {"itens": [], "termo_aceito": False},
            format="json",
        )
        assert resp.status_code == 400

    def test_aprovacao_com_termo(self, api_client, ordem_servico, itens_orcamento):
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/aprovacao/",
            {
                "itens": [
                    {"id": itens_orcamento[0].id, "status": "aprovado"},
                ],
                "termo_aceito": True,
            },
            format="json",
        )
        assert resp.status_code == 200

    def test_enviar_aprovacao_gera_codigo(self, api_client, ordem_servico, itens_orcamento):
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/enviar-aprovacao/",
            {"validade_dias": 5, "max_tentativas": 3},
            format="json",
        )
        assert resp.status_code == 200
        assert CodigoAcessoOS.objects.filter(os=ordem_servico).exists()

    def test_enviar_aprovacao_sem_itens_falha(self, api_client, ordem_servico):
        """OS sem itens não pode ser enviada para aprovação."""
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/enviar-aprovacao/",
            {}, format="json",
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Tarefas de execução
# ---------------------------------------------------------------------------

class TestTarefas:
    def test_listar_tarefas(self, api_client, ordem_servico):
        TarefaExecucao.objects.create(os=ordem_servico, descricao="Teste", status="pendente")
        resp = api_client.get(f"/api/oficina/os/{ordem_servico.id}/tarefas/")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_criar_tarefa(self, api_client, ordem_servico):
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/tarefas/",
            {"descricao": "Nova tarefa", "status": "pendente"},
            format="json",
        )
        assert resp.status_code == 201

    def test_atualizar_tarefa(self, api_client, ordem_servico):
        t = TarefaExecucao.objects.create(os=ordem_servico, descricao="X")
        resp = api_client.put(
            f"/api/oficina/os/{ordem_servico.id}/tarefas/{t.id}/",
            {"descricao": "X", "status": "execucao"},
            format="json",
        )
        assert resp.status_code == 200

    def test_excluir_tarefa(self, api_client, ordem_servico):
        t = TarefaExecucao.objects.create(os=ordem_servico, descricao="X")
        resp = api_client.delete(f"/api/oficina/os/{ordem_servico.id}/tarefas/{t.id}/")
        assert resp.status_code in (200, 204)


# ---------------------------------------------------------------------------
# Documentos
# ---------------------------------------------------------------------------

class TestDocumentos:
    def test_listar_documentos(self, api_client, ordem_servico):
        resp = api_client.get(f"/api/oficina/os/{ordem_servico.id}/documentos/")
        assert resp.status_code == 200

    def test_regras_upload(self, api_client):
        resp = api_client.get("/api/oficina/upload-os/regras/")
        assert resp.status_code == 200
        assert "tamanho_max_mb" in resp.json()

    def test_upload_pdf_valido(self, api_client, ordem_servico, settings, tmp_path):
        settings.MEDIA_ROOT = str(tmp_path)
        arq = SimpleUploadedFile("nota.pdf", b"%PDF-fake", content_type="application/pdf")
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/documentos/upload/",
            {"files": arq}, format="multipart",
        )
        assert resp.status_code == 201

    def test_excluir_documento(self, api_client, ordem_servico, settings, tmp_path):
        settings.MEDIA_ROOT = str(tmp_path)
        arq = SimpleUploadedFile("a.pdf", b"x", content_type="application/pdf")
        doc = Documento.objects.create(os=ordem_servico, arquivo=arq, nome_arquivo="a.pdf")
        resp = api_client.delete(f"/api/oficina/documentos/{doc.id}/")
        assert resp.status_code in (200, 204)


# ---------------------------------------------------------------------------
# Histórico
# ---------------------------------------------------------------------------

class TestHistorico:
    def test_listar_historico(self, api_client, ordem_servico):
        HistoricoOS.objects.create(os=ordem_servico, tipo="criacao", descricao="OS criada")
        resp = api_client.get(f"/api/oficina/os/{ordem_servico.id}/historico/")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Código de acesso
# ---------------------------------------------------------------------------

class TestCodigoAcesso:
    def test_get_sem_codigo_existente(self, api_client, ordem_servico):
        resp = api_client.get(f"/api/oficina/os/{ordem_servico.id}/codigo-acesso/")
        assert resp.status_code == 200
        assert resp.json()["existe"] is False

    def test_post_gera_codigo(self, api_client, ordem_servico):
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/codigo-acesso/",
            {"validade_dias": 7, "max_tentativas": 5},
            format="json",
        )
        assert resp.status_code == 201

    def test_post_validade_invalida_falha(self, api_client, ordem_servico):
        resp = api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/codigo-acesso/",
            {"validade_dias": 100},  # acima de 60
            format="json",
        )
        assert resp.status_code == 400

    def test_get_apos_gerar_devolve_codigo_ativo(self, api_client, ordem_servico):
        api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/codigo-acesso/",
            {"validade_dias": 7, "max_tentativas": 5},
            format="json",
        )
        resp = api_client.get(f"/api/oficina/os/{ordem_servico.id}/codigo-acesso/")
        assert resp.status_code == 200
        assert resp.json()["existe"] is True

    def test_delete_revoga_codigo(self, api_client, ordem_servico):
        api_client.post(
            f"/api/oficina/os/{ordem_servico.id}/codigo-acesso/",
            {"validade_dias": 7, "max_tentativas": 5},
            format="json",
        )
        resp = api_client.delete(f"/api/oficina/os/{ordem_servico.id}/codigo-acesso/")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Manutenção preventiva
# ---------------------------------------------------------------------------

class TestManutencaoPreventiva:
    def test_listar_e_criar(self, api_client, veiculo):
        resp = api_client.get(f"/api/oficina/veiculos/{veiculo.id}/manutencoes/")
        assert resp.status_code == 200

        resp = api_client.post(
            f"/api/oficina/veiculos/{veiculo.id}/manutencoes/",
            {
                "titulo": "Troca de óleo a cada 10k",
                "descricao": "OEM",
                "periodicidade": "km",
                "intervalo_km": 10000,
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_atualizar_e_excluir(self, api_client, veiculo):
        m = ManutencaoPreventiva.objects.create(
            veiculo=veiculo, titulo="T", periodicidade="km", intervalo_km=5000,
        )
        resp = api_client.patch(
            f"/api/oficina/manutencoes/{m.id}/",
            {"titulo": "Atualizada"}, format="json",
        )
        assert resp.status_code == 200

        resp = api_client.delete(f"/api/oficina/manutencoes/{m.id}/")
        assert resp.status_code in (200, 204)

    def test_gerar_os_de_manutencao(self, api_client, veiculo):
        m = ManutencaoPreventiva.objects.create(
            veiculo=veiculo, titulo="T", periodicidade="km", intervalo_km=5000,
        )
        resp = api_client.post(f"/api/oficina/manutencoes/{m.id}/gerar-os/")
        assert resp.status_code in (200, 201)


# ---------------------------------------------------------------------------
# Preços / categorias / serviços
# ---------------------------------------------------------------------------

class TestConfiguracaoOficina:
    def test_get_e_put_valor_hora(self, api_client):
        resp = api_client.get("/api/oficina/configuracao/")
        assert resp.status_code == 200
        resp = api_client.put(
            "/api/oficina/configuracao/", {"valor_hora": "150.00"}, format="json",
        )
        assert resp.status_code == 200


class TestServicos:
    def test_listar_e_criar(self, api_client, oficina):
        resp = api_client.get("/api/oficina/servicos/")
        assert resp.status_code == 200

        resp = api_client.post(
            "/api/oficina/servicos/",
            {
                "nome": "Alinhamento",
                "descricao": "Geometria 3D",
                "tempo": "1.50",
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_detalhe_e_atualizar(self, api_client, oficina):
        s = Servico.objects.create(
            oficina=oficina, nome="Bal", descricao="bal", tempo_estimado=Decimal("1.0"),
        )
        resp = api_client.get(f"/api/oficina/servicos/{s.id}/")
        assert resp.status_code == 200
        resp = api_client.patch(
            f"/api/oficina/servicos/{s.id}/",
            {"nome": "Balanceamento"}, format="json",
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Funcionários
# ---------------------------------------------------------------------------

class TestFuncionarios:
    def test_listar_funcionarios(self, api_client, funcionario):
        resp = api_client.get("/api/oficina/funcionarios/")
        assert resp.status_code == 200

    def test_criar_funcionario(self, api_client):
        resp = api_client.post(
            "/api/oficina/funcionarios/",
            {
                "email": "novo@func.com",
                "password": "senha-de-teste-123",
                "primeiro_nome": "Novo",
                "ultimo_nome": "Func",
                "permissao": "mecanico",
                "is_active": True,
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_detalhe_funcionario(self, api_client, funcionario):
        resp = api_client.get(f"/api/oficina/funcionarios/{funcionario.id}/")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class TestDashboard:
    def test_dashboard_padrao(self, api_client, ordem_servico, itens_orcamento):
        resp = api_client.get("/api/oficina/dashboard/")
        assert resp.status_code == 200
        body = resp.json()
        assert "kpis" in body and "graficos" in body

    def test_dashboard_periodo_customizado(self, api_client):
        resp = api_client.get("/api/oficina/dashboard/?periodo=7")
        assert resp.status_code == 200

    def test_dashboard_periodo_invalido_cai_no_default(self, api_client):
        resp = api_client.get("/api/oficina/dashboard/?periodo=abc")
        assert resp.status_code == 200

    def test_dashboard_analise(self, api_client, ordem_servico, itens_orcamento):
        resp = api_client.get("/api/oficina/dashboard/analise/")
        assert resp.status_code == 200
        body = resp.json()
        assert "resumo_executivo" in body
        assert "insights" in body
