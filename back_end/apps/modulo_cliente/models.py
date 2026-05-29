"""Modelos do modulo_cliente.

Hoje, o único modelo próprio é o `CodigoAcessoOS` — um token curto +
contador de tentativas que substitui o "número da OS" como segundo fator
para o cliente acessar o portal. Mais seguro porque:
- Tem expiração configurável.
- É independente do id da OS (não dá para chutar).
- Pode ser revogado pela oficina a qualquer momento.
- Tem limite de tentativas para mitigar brute force.
"""
import secrets
import string

from django.conf import settings
from django.db import models
from django.utils import timezone


def _gerar_codigo(tamanho=8):
    """Gera código aleatório com letras maiúsculas + dígitos.

    Evita caracteres ambíguos (0, O, 1, I, L) para reduzir erros de leitura
    quando a oficina entrega o código por papel/WhatsApp.
    """
    alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sem 0/O/1/I/L
    return "".join(secrets.choice(alfabeto) for _ in range(tamanho))


class CodigoAcessoOS(models.Model):
    """Token único que combinado com o CPF/CNPJ libera o portal do cliente."""

    os = models.ForeignKey(
        "modulo_oficina.OrdemServico",
        on_delete=models.CASCADE,
        related_name="codigos_acesso",
    )
    codigo = models.CharField(max_length=20, unique=True, db_index=True)
    gerado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="codigos_acesso_gerados",
    )

    expira_em = models.DateTimeField()
    tentativas = models.PositiveSmallIntegerField(default=0)
    max_tentativas = models.PositiveSmallIntegerField(default=5)
    revogado = models.BooleanField(default=False)
    ultimo_uso_em = models.DateTimeField(blank=True, null=True)

    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "codigo_acesso_os"
        ordering = ("-criado_em",)
        indexes = [
            models.Index(fields=("os", "-criado_em")),
        ]

    def __str__(self):
        return f"OS #{self.os_id} · {self.codigo}"

    # ---- API utilitária ----

    @property
    def expirado(self):
        return self.expira_em <= timezone.now()

    @property
    def bloqueado(self):
        return self.tentativas >= self.max_tentativas

    @property
    def valido(self):
        return not (self.revogado or self.expirado or self.bloqueado)

    @classmethod
    def gerar(cls, os_obj, *, gerado_por=None, validade_dias=7, max_tentativas=5):
        """Cria um novo código, revogando códigos anteriores ativos da mesma OS.

        Garantir um único código ativo por OS facilita o cliente
        (sempre o último vale) e evita criar histórico maior do que o
        necessário.
        """
        cls.objects.filter(os=os_obj, revogado=False).update(revogado=True)
        expira = timezone.now() + timezone.timedelta(days=int(validade_dias))
        # Loop simples — colisões em 31^8 são desprezíveis, mas garantimos
        # via unique=True
        for _ in range(8):
            codigo = _gerar_codigo()
            if not cls.objects.filter(codigo=codigo).exists():
                break
        else:
            # fallback extremamente improvável
            codigo = _gerar_codigo(tamanho=12)
        return cls.objects.create(
            os=os_obj,
            codigo=codigo,
            gerado_por=gerado_por,
            expira_em=expira,
            max_tentativas=max_tentativas,
        )

    def registrar_tentativa_falha(self):
        self.tentativas = (self.tentativas or 0) + 1
        self.save(update_fields=["tentativas"])

    def registrar_uso(self):
        self.ultimo_uso_em = timezone.now()
        self.save(update_fields=["ultimo_uso_em"])

    def revogar(self):
        self.revogado = True
        self.save(update_fields=["revogado"])
