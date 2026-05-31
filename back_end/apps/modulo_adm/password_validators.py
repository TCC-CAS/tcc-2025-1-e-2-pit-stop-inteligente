"""Validators de senha customizados — política de segurança do Pit Stop.

A pilha de validators é configurada em `core/settings/base.py` na chave
`AUTH_PASSWORD_VALIDATORS`. Cada classe abaixo cuida de UMA regra e
expõe `get_help_text()` para que o front-end recupere e exiba os
requisitos ao usuário (via endpoint `/api/oficina/auth/password-rules/`
ou hard-coded no front).

Política exigida (TCC):
  1. Mínimo de 8 caracteres   — `MinimumLengthValidator` (built-in do Django).
  2. Pelo menos 1 letra MAIÚSCULA   — `UppercaseValidator` (este módulo).
  3. Pelo menos 1 letra minúscula    — `LowercaseValidator` (este módulo).
  4. Pelo menos 1 dígito numérico    — `NumberValidator` (este módulo).
  5. Pelo menos 1 caractere especial — `SpecialCharValidator` (este módulo).
  6. Senhas comuns rejeitadas        — `CommonPasswordValidator` (built-in).
  7. Sem ser puramente numérica      — `NumericPasswordValidator` (built-in).
  8. Sem similaridade com username   — `UserAttributeSimilarityValidator` (built-in).
"""
from __future__ import annotations

import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


# Conjunto canônico de caracteres especiais aceitos. Escolhido para cobrir
# o teclado padrão ABNT2 sem incluir acentos (que costumam variar conforme
# layout do SO e causam falsos positivos).
_ESPECIAIS = r"!@#$%^&*()\-_=+\[\]{};:'\",.<>/?\\|`~"


class UppercaseValidator:
    """Exige ao menos uma letra maiúscula (A–Z, incluindo acentuadas)."""

    def validate(self, password, user=None):
        if not re.search(r"[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ]", password or ""):
            raise ValidationError(
                _("A senha deve conter ao menos uma letra MAIÚSCULA."),
                code="senha_sem_maiuscula",
            )

    def get_help_text(self):
        return _("Sua senha deve conter ao menos uma letra MAIÚSCULA.")


class LowercaseValidator:
    """Exige ao menos uma letra minúscula (a–z, incluindo acentuadas)."""

    def validate(self, password, user=None):
        if not re.search(r"[a-záéíóúâêôãõàç]", password or ""):
            raise ValidationError(
                _("A senha deve conter ao menos uma letra minúscula."),
                code="senha_sem_minuscula",
            )

    def get_help_text(self):
        return _("Sua senha deve conter ao menos uma letra minúscula.")


class NumberValidator:
    """Exige ao menos um dígito numérico (0–9)."""

    def validate(self, password, user=None):
        if not re.search(r"\d", password or ""):
            raise ValidationError(
                _("A senha deve conter ao menos um número."),
                code="senha_sem_numero",
            )

    def get_help_text(self):
        return _("Sua senha deve conter ao menos um número (0-9).")


class SpecialCharValidator:
    """Exige ao menos um caractere especial do conjunto canônico."""

    def validate(self, password, user=None):
        if not re.search(f"[{_ESPECIAIS}]", password or ""):
            raise ValidationError(
                _(
                    "A senha deve conter ao menos um caractere especial "
                    "(ex.: !@#$%&* entre outros)."
                ),
                code="senha_sem_especial",
            )

    def get_help_text(self):
        return _(
            "Sua senha deve conter ao menos um caractere especial "
            "(!@#$%&*+-_? entre outros)."
        )
