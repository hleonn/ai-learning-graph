"""
Bayesian Knowledge Tracing (BKT)
---------------------------------
Modelo estándar de la industria para estimar si un estudiante
domina un concepto. Usado por Khan Academy y Carnegie Learning.

Parámetros:
  p_l0  : probabilidad inicial de conocer el concepto (prior)
  p_t   : probabilidad de aprender en cada intento (transit)
  p_g   : probabilidad de acertar sin saber (guess)
  p_s   : probabilidad de fallar sabiendo (slip)
"""

from loguru import logger


def update_mastery(
    current_mastery: float,
    correct: bool,
    p_l0: float = 0.1,
    p_t:  float = 0.2,
    p_g:  float = 0.1,
    p_s:  float = 0.05,
) -> float:
    """
    Actualiza el score de mastery dado una respuesta correcta o incorrecta.

    Args:
        current_mastery: score actual (0.0 a 1.0)
        correct:         True si el estudiante respondió correctamente
        p_l0:            prior de conocimiento inicial
        p_t:             probabilidad de transición (aprender)
        p_g:             probabilidad de guess (acertar sin saber)
        p_s:             probabilidad de slip (fallar sabiendo)

    Returns:
        nuevo score de mastery (0.0 a 1.0)
    """
    p_l = current_mastery

    # ── Paso 1: actualizar según evidencia (respuesta) ────────────────────────
    if correct:
        # P(Ln | correcto) = P(correcto | sabe) * P(sabe) / P(correcto)
        numerator   = p_l * (1 - p_s)
        denominator = p_l * (1 - p_s) + (1 - p_l) * p_g
    else:
        # P(Ln | incorrecto) = P(incorrecto | sabe) * P(sabe) / P(incorrecto)
        numerator   = p_l * p_s
        denominator = p_l * p_s + (1 - p_l) * (1 - p_g)

    # Evitar división por cero
    if denominator == 0:
        p_l_given_evidence = p_l
    else:
        p_l_given_evidence = numerator / denominator

    # ── Paso 2: aplicar transición de aprendizaje ─────────────────────────────
    # P(Ln+1) = P(Ln | evidencia) + P(T) * (1 - P(Ln | evidencia))
    new_mastery = p_l_given_evidence + p_t * (1 - p_l_given_evidence)

    # Clamp entre 0 y 1
    new_mastery = max(0.0, min(1.0, new_mastery))

    logger.debug(
        f"BKT update: {current_mastery:.3f} → {new_mastery:.3f} "
        f"({'✓' if correct else '✗'})"
    )

    return round(new_mastery, 4)


def mastery_level(score: float) -> str:
    """
    Convierte un score numérico en una etiqueta legible.
    """
    if score >= 0.8:
        return "mastered"
    elif score >= 0.6:
        return "learning"
    elif score >= 0.3:
        return "struggling"
    else:
        return "not_started"