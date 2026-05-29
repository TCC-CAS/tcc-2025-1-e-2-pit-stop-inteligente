"""APIs do Production Health (aba "Saúde da aplicação")."""
from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import EventoErroProducao, GrupoErroProducao
from ..permissions import IsAdminGlobal
from ..serializers_production_health import (
    EventoErroSerializer,
    GrupoErroDetalheSerializer,
    GrupoErroListaSerializer,
)
from ..utils import registrar_auditoria


def _qs_base():
    return GrupoErroProducao.objects.all()


def _aplicar_filtros(qs, params):
    """Compartilhado entre a lista e o sumário."""
    # Janela temporal: aceita 15m / 1h / 24h / 7d (default 24h)
    janela = (params.get("janela") or "24h").lower()
    horas_por_janela = {"15m": 0.25, "1h": 1, "6h": 6, "24h": 24, "7d": 24 * 7, "30d": 24 * 30}
    horas = horas_por_janela.get(janela, 24)
    desde = timezone.now() - timedelta(hours=horas)
    qs = qs.filter(ultima_ocorrencia__gte=desde)

    ambiente = params.get("ambiente")
    if ambiente:
        qs = qs.filter(ambiente=ambiente)
    severidade = params.get("severidade")
    if severidade:
        qs = qs.filter(severidade=severidade)
    status_ = params.get("status")
    if status_:
        qs = qs.filter(status=status_)
    elif params.get("ocultar_silenciados") == "1":
        qs = qs.exclude(status="silenciado")
    servico = params.get("servico")
    if servico:
        qs = qs.filter(servico=servico)
    busca = (params.get("busca") or "").strip()
    if busca:
        qs = qs.filter(
            Q(titulo__icontains=busca)
            | Q(mensagem_tecnica__icontains=busca)
            | Q(endpoint__icontains=busca)
            | Q(tipo_excecao__icontains=busca)
            | Q(servico__icontains=busca),
        )
    so_5xx = params.get("so_5xx") == "1"
    if so_5xx:
        qs = qs.filter(eventos__status_http__gte=500).distinct()
    return qs


class ProductionHealthFeedAPIView(APIView):
    """GET /api/admin/saude/erros/ — feed paginado de grupos de erro."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        qs = _aplicar_filtros(_qs_base(), request.GET)

        ordenacao = request.GET.get("ordenar_por") or "ultima_ocorrencia"
        mapa_ord = {
            "ultima_ocorrencia": "-ultima_ocorrencia",
            "primeira_ocorrencia": "-primeira_ocorrencia",
            "total_eventos": "-total_eventos",
            "usuarios_afetados": "-usuarios_afetados",
        }
        qs = qs.order_by(mapa_ord.get(ordenacao, "-ultima_ocorrencia"))

        try:
            page = max(1, int(request.GET.get("page", 1)))
            page_size = min(100, max(5, int(request.GET.get("page_size", 25))))
        except ValueError:
            page, page_size = 1, 25

        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size

        return Response({
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "results": GrupoErroListaSerializer(qs[start:end], many=True).data,
        })


class ProductionHealthGrupoAPIView(APIView):
    """GET/PATCH /api/admin/saude/erros/<id>/."""
    permission_classes = [IsAdminGlobal]

    def get(self, request, pk):
        grupo = get_object_or_404(_qs_base(), pk=pk)
        return Response(
            GrupoErroDetalheSerializer(grupo, context={"limite_eventos": 10}).data,
        )

    def patch(self, request, pk):
        """Permite atualizar status / severidade / silenciamento."""
        grupo = get_object_or_404(_qs_base(), pk=pk)
        dados = request.data or {}

        mudancas = {}
        if "severidade" in dados and dados["severidade"]:
            mudancas["severidade"] = (grupo.severidade, dados["severidade"])
            grupo.severidade = dados["severidade"]

        if "status" in dados and dados["status"]:
            antes = grupo.status
            novo = dados["status"]
            grupo.status = novo
            mudancas["status"] = (antes, novo)
            if novo == "resolvido":
                grupo.resolvido_em = timezone.now()
                grupo.resolvido_por = request.user
            elif antes == "resolvido":
                grupo.resolvido_em = None
                grupo.resolvido_por = None
            if novo == "silenciado":
                ate = dados.get("silenciado_ate")
                horas = dados.get("silenciar_por_horas")
                if ate:
                    grupo.silenciado_ate = ate
                elif horas:
                    try:
                        grupo.silenciado_ate = timezone.now() + timedelta(hours=float(horas))
                    except (TypeError, ValueError):
                        return Response(
                            {"erro": "silenciar_por_horas inválido."},
                            status=http_status.HTTP_400_BAD_REQUEST,
                        )
                else:
                    # silenciamento default: 24h
                    grupo.silenciado_ate = timezone.now() + timedelta(hours=24)
                grupo.silenciado_por = request.user
            else:
                grupo.silenciado_ate = None
                grupo.silenciado_por = None

        grupo.save()

        if mudancas:
            registrar_auditoria(
                request,
                acao="prod_health.atualizar",
                descricao=f"Grupo de erro #{grupo.id} atualizado",
                recurso="grupo_erro_producao",
                recurso_id=str(grupo.id),
                metadados={k: {"de": v[0], "para": v[1]} for k, v in mudancas.items()},
            )

        return Response(
            GrupoErroDetalheSerializer(grupo, context={"limite_eventos": 10}).data,
        )


class ProductionHealthGrupoEventosAPIView(APIView):
    """GET /api/admin/saude/erros/<id>/eventos/ — paginado."""
    permission_classes = [IsAdminGlobal]

    def get(self, request, pk):
        grupo = get_object_or_404(_qs_base(), pk=pk)
        try:
            page = max(1, int(request.GET.get("page", 1)))
            page_size = min(100, max(5, int(request.GET.get("page_size", 25))))
        except ValueError:
            page, page_size = 1, 25

        qs = grupo.eventos.all().order_by("-criado_em")
        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size

        return Response({
            "total": total,
            "page": page,
            "page_size": page_size,
            "results": EventoErroSerializer(qs[start:end], many=True).data,
        })


class ProductionHealthGerarTicketAPIView(APIView):
    """POST /api/admin/saude/erros/<id>/ticket/

    Cria um Ticket de suporte com a "history" do grupo de erro
    pré-preenchida: título, descrição técnica, contagem, primeira/última
    ocorrência e link para o grupo. Retorna {ticket_id, titulo}.

    O ticket é criado em nome do usuário admin que clicou no botão,
    com origem='admin' e prioridade derivada da severidade do grupo.
    """

    permission_classes = [IsAdminGlobal]

    def post(self, request, pk):
        grupo = get_object_or_404(_qs_base(), pk=pk)

        # Import lazy para evitar import circular entre apps
        from apps.modulo_suporte.models import Ticket

        # Mapeia severidade do grupo → prioridade do ticket
        mapa_prio = {
            "critical": "urgente",
            "error": "alta",
            "warning": "normal",
            "info": "baixa",
        }
        prioridade = mapa_prio.get(grupo.severidade, "alta")

        titulo = f"[Saúde] {grupo.titulo}"[:160]
        descricao = (
            f"Ticket aberto automaticamente a partir do feed de Saúde da Aplicação.\n\n"
            f"Grupo de erro: #{grupo.id}\n"
            f"Tipo: {grupo.tipo_excecao or '—'}\n"
            f"Endpoint: {grupo.metodo_http or ''} {grupo.endpoint or '—'}\n"
            f"Serviço: {grupo.servico or '—'}\n"
            f"Ambiente: {grupo.ambiente or '—'}\n"
            f"Severidade: {grupo.severidade}\n"
            f"Ocorrências: {grupo.total_eventos} (usuários afetados: {grupo.usuarios_afetados})\n"
            f"Primeira ocorrência: {grupo.primeira_ocorrencia:%d/%m/%Y %H:%M}\n"
            f"Última ocorrência: {grupo.ultima_ocorrencia:%d/%m/%Y %H:%M}\n\n"
            f"Mensagem técnica:\n{grupo.mensagem_tecnica or '(sem mensagem)'}"
        )

        ticket = Ticket.objects.create(
            titulo=titulo,
            descricao=descricao,
            categoria="tecnico",
            prioridade=prioridade,
            origem="admin",
            autor_user=request.user,
            nao_lidas_admin=0,  # ele já está vendo
        )

        registrar_auditoria(
            request,
            acao="saude.gerar_ticket",
            descricao=f"Ticket #{ticket.id} aberto a partir do grupo #{grupo.id}.",
            recurso="ticket",
            recurso_id=str(ticket.id),
            metadados={"grupo_id": grupo.id, "fingerprint": grupo.fingerprint},
        )

        return Response(
            {
                "mensagem": "Ticket criado com sucesso.",
                "ticket_id": ticket.id,
                "titulo": ticket.titulo,
                "prioridade": ticket.prioridade,
            },
            status=http_status.HTTP_201_CREATED,
        )


class ProductionHealthSumarioAPIView(APIView):
    """GET /api/admin/saude/sumario/ — KPIs para o cabeçalho da aba."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        agora = timezone.now()
        h24 = agora - timedelta(hours=24)
        h48 = agora - timedelta(hours=48)
        h168 = agora - timedelta(hours=24 * 7)

        eventos_24h = EventoErroProducao.objects.filter(criado_em__gte=h24).count()
        eventos_48a24 = EventoErroProducao.objects.filter(
            criado_em__gte=h48, criado_em__lt=h24,
        ).count()
        eventos_7d = EventoErroProducao.objects.filter(criado_em__gte=h168).count()

        if eventos_48a24 == 0:
            variacao_pct = 100.0 if eventos_24h > 0 else 0.0
        else:
            variacao_pct = round(
                ((eventos_24h - eventos_48a24) / eventos_48a24) * 100.0, 1,
            )

        agg = GrupoErroProducao.objects.aggregate(
            grupos_abertos=Count("id", filter=Q(status="aberto")),
            grupos_silenciados=Count("id", filter=Q(status="silenciado")),
            grupos_resolvidos_7d=Count(
                "id", filter=Q(status="resolvido", resolvido_em__gte=h168),
            ),
            criticos=Count(
                "id",
                filter=Q(severidade="critical")
                       & Q(status__in=("aberto", "monitorando"))
                       & Q(ultima_ocorrencia__gte=h24),
            ),
            servicos_afetados=Count(
                "servico", distinct=True,
                filter=Q(ultima_ocorrencia__gte=h24) & ~Q(servico=""),
            ),
        )

        top_endpoints = list(
            GrupoErroProducao.objects
            .filter(ultima_ocorrencia__gte=h24)
            .values("endpoint")
            .annotate(qtd=Count("id"), erros=Count("total_eventos"))
            .order_by("-qtd")[:5]
        )

        return Response({
            "eventos_24h": eventos_24h,
            "eventos_24h_anterior": eventos_48a24,
            "variacao_pct": variacao_pct,
            "eventos_7d": eventos_7d,
            "top_endpoints_24h": top_endpoints,
            **agg,
        })
