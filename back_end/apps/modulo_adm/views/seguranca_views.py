"""APIs do painel admin para visualizar/atuar sobre eventos de segurança."""
from __future__ import annotations

from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import EventoSeguranca
from ..permissions import IsAdminGlobal
from ..services.seguranca_service import bloquear_ip


class SegurancaSumarioAPIView(APIView):
    """GET /api/admin/seguranca/sumario/ — KPIs do cabeçalho."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        agora = timezone.now()
        ult_24h = agora - timedelta(hours=24)
        ult_7d = agora - timedelta(days=7)

        ev24 = EventoSeguranca.objects.filter(criado_em__gte=ult_24h)
        agregados = ev24.aggregate(
            total_24h=Count("id"),
            criticos_24h=Count("id", filter=Q(severidade="critical")),
            login_falhas=Count("id", filter=Q(categoria="login_falha")),
            login_lockouts=Count("id", filter=Q(categoria="login_lockout")),
            honeypots=Count("id", filter=Q(categoria="honeypot")),
            ua_suspeitos=Count("id", filter=Q(categoria="user_agent_suspeito")),
            ips_bloqueados=Count("id", filter=Q(categoria="ip_bloqueado")),
        )

        # IPs em "atenção" (com mais eventos) nas últimas 24h
        top_ips = list(
            ev24.exclude(ip__isnull=True).exclude(ip="")
            .values("ip")
            .annotate(qtd=Count("id"))
            .order_by("-qtd")[:5]
        )

        # Tendência: comparação 24h vs 24h anteriores
        ult_48h = agora - timedelta(hours=48)
        ev_24h_anterior = EventoSeguranca.objects.filter(
            criado_em__gte=ult_48h, criado_em__lt=ult_24h,
        ).count()

        return Response({
            **agregados,
            "ev_24h_anterior": ev_24h_anterior,
            "top_ips_24h": top_ips,
            "eventos_7d": EventoSeguranca.objects.filter(criado_em__gte=ult_7d).count(),
            "calculado_em": agora.isoformat(),
        })


class SegurancaEventosAPIView(APIView):
    """GET /api/admin/seguranca/eventos/ — feed paginado de eventos."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        qs = EventoSeguranca.objects.all()

        categoria = request.GET.get("categoria")
        if categoria:
            qs = qs.filter(categoria=categoria)
        severidade = request.GET.get("severidade")
        if severidade:
            qs = qs.filter(severidade=severidade)
        ip = (request.GET.get("ip") or "").strip()
        if ip:
            qs = qs.filter(ip=ip)
        alvo = (request.GET.get("alvo") or "").strip()
        if alvo:
            qs = qs.filter(alvo__icontains=alvo)
        janela = (request.GET.get("janela") or "24h").lower()
        horas = {"1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30}.get(janela, 24)
        qs = qs.filter(criado_em__gte=timezone.now() - timedelta(hours=horas))

        try:
            page = max(1, int(request.GET.get("page", 1)))
            page_size = min(100, max(5, int(request.GET.get("page_size", 25))))
        except ValueError:
            page, page_size = 1, 25

        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size

        results = list(qs[start:end].values(
            "id", "categoria", "severidade", "ip", "user_agent",
            "alvo", "endpoint", "metadados", "criado_em",
        ))
        # Formatação amigável da data para o front
        for r in results:
            r["criado_em"] = r["criado_em"].strftime("%d/%m/%Y %H:%M:%S")

        return Response({
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "results": results,
        })


class SegurancaBloquearIpAPIView(APIView):
    """POST /api/admin/seguranca/bloquear-ip/ — bloqueia um IP manualmente.

    Body: { "ip": "1.2.3.4", "horas": 2, "motivo": "..." }
    """
    permission_classes = [IsAdminGlobal]

    def post(self, request):
        ip = (request.data.get("ip") or "").strip()
        if not ip:
            return Response({"erro": "Informe o IP."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            horas = float(request.data.get("horas") or 2)
        except (TypeError, ValueError):
            horas = 2.0
        horas = max(0.1, min(horas, 168))  # entre 6 min e 7 dias
        motivo = (request.data.get("motivo") or "Bloqueio manual via painel")[:255]
        bloquear_ip(ip, segundos=int(horas * 3600), motivo=motivo)
        return Response({
            "mensagem": f"IP {ip} bloqueado por {horas} hora(s).",
            "ip": ip,
            "duracao_horas": horas,
        })


class SegurancaDesbloquearIpAPIView(APIView):
    """POST /api/admin/seguranca/desbloquear-ip/ — remove bloqueio de IP."""
    permission_classes = [IsAdminGlobal]

    def post(self, request):
        ip = (request.data.get("ip") or "").strip()
        if not ip:
            return Response({"erro": "Informe o IP."}, status=status.HTTP_400_BAD_REQUEST)
        cache.delete(f"seg:ipblock:{ip}")
        cache.delete(f"seg:ipcount:{ip}")
        return Response({"mensagem": f"IP {ip} desbloqueado."})
