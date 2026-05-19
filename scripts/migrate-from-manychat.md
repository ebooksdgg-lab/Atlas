# Migración ManyChat → Atlas

Este documento describe el proceso para migrar números activos de ManyChat a Atlas.
No hay migración automática — cada número debe reconectarse manualmente vía Meta Embedded Signup.

## Checklist por número

1. **En ManyChat**: pausar el número (deshabilitar respuestas automáticas) para evitar respuestas paralelas durante la transición.
2. **En Atlas**: ir a `/connect`, seleccionar el producto correspondiente y completar el Embedded Signup del número.
3. **Verificar** en el Dashboard de Atlas que el número aparece como **Activo** con calidad **Verde**.
4. **En Typebot**: el flow del producto ya debe estar configurado y publicado antes de conectar el número.
5. **Prueba de humo**: enviar un mensaje desde un número de prueba y verificar que Typebot responde correctamente y que Chatwoot recibe la conversación.
6. **En ManyChat**: una vez confirmado que Atlas funciona, revocar el acceso del número en ManyChat.

## Mapeo de productos ManyChat → Atlas

| ManyChat Bot | Producto Atlas | Typebot ID |
|---|---|---|
| (completar) | (completar) | (completar) |

## Orden de migración sugerido

Migrar de a un número por vez, empezando por los de menor volumen de mensajes.

1. Número de prueba / staging (si existe)
2. Números con calidad YELLOW o RED (igual requieren atención)
3. Números de alto volumen (TIER_1K, TIER_10K) en horario de bajo tráfico

## Rollback

Si algo falla durante la migración de un número específico:
1. En Atlas: ir a Acciones → Desconectar para liberar la instancia de Evolution
2. En ManyChat: reactivar el número

No hay datos de conversación que se pierdan — Chatwoot e historial de Typebot son independientes de ManyChat.
