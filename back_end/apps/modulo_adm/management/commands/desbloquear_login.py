"""Comando: limpa rate limits, lockouts e IP blocks acumulados.

Útil em desenvolvimento depois de uma sequência de tentativas de login
ou requests inválidas que tenham acionado as defesas. Em produção,
mantém o comportamento normal — basta esperar a janela expirar OU rodar
explicitamente quando souber que o bloqueio é falso positivo.

Uso:
    python manage.py desbloquear_login                    # limpa tudo
    python manage.py desbloquear_login --email u@u.com    # só esse email
    python manage.py desbloquear_login --ip 127.0.0.1     # só esse IP
"""
from django.core.cache import cache
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Limpa cache de segurança (rate limit / lockout / IP block) do modulo_adm."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email", type=str, default="",
            help="Só limpa as chaves desse e-mail (login_fail / login_lock).",
        )
        parser.add_argument(
            "--ip", type=str, default="",
            help="Só limpa o bloqueio desse IP.",
        )
        parser.add_argument(
            "--all", action="store_true",
            help="Limpa todo o cache (incluindo outras chaves não relacionadas).",
        )

    def handle(self, *args, **opts):
        email = (opts.get("email") or "").strip().lower()
        ip = (opts.get("ip") or "").strip()
        zerar_tudo = bool(opts.get("all"))

        if zerar_tudo:
            cache.clear()
            self.stdout.write(self.style.SUCCESS("Cache inteiro limpo."))
            return

        if email:
            self._limpar_email(email)
        if ip:
            self._limpar_ip(ip)

        if not email and not ip:
            # Sem filtros, limpa as famílias relacionadas ao login/seg.
            self._limpar_familia("login_fail")
            self._limpar_familia("login_lock")
            self._limpar_familia("login")  # rate limit
            self._limpar_familia("ip_block")
            self._limpar_familia("ip_events")
            self.stdout.write(
                self.style.SUCCESS(
                    "Cache de segurança limpo (lockouts, rate limits, IP blocks). "
                    "Tente logar novamente."
                )
            )

    def _limpar_email(self, email):
        # Tenta as chaves diretas — não escaneia o cache (o backend pode não
        # suportar). Funciona porque o `_chave` em seguranca_service usa
        # padrão "<familia>:<id>".
        from apps.modulo_adm.services.seguranca_service import resetar_falhas_login
        resetar_falhas_login(email)
        self.stdout.write(self.style.SUCCESS(f"Email '{email}' desbloqueado."))

    def _limpar_ip(self, ip):
        cache.delete_many([
            f"ip_block:{ip}",
            f"ip_events:{ip}",
        ])
        self.stdout.write(self.style.SUCCESS(f"IP '{ip}' desbloqueado."))

    def _limpar_familia(self, prefixo):
        # `LocMemCache` (default em testes) suporta clear() global mas não
        # delete_pattern. Como o usuário roda o comando explicitamente,
        # caímos no clear() quando não há chaves específicas.
        try:
            cache.clear()
        except Exception:
            pass
