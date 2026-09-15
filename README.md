# Tienda CEDIA

Tienda en línea de Grupo CEDIA con Node.js + Express y conectores para Syscom, CT Internacional, TVC en Línea, Mercado Pago y Mercado Libre.

## Etapa 1: seguridad

1. Instala dependencias: `npm install`.
2. Copia `.env.example` a `.env`.
3. Genera el hash de administrador:
   `node scripts/generate-admin-hash.js "TuContraseñaSeguraDe12+"`
4. Copia el valor mostrado en `ADMIN_PASSWORD_HASH`.
5. Genera `SESSION_SECRET` con:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
6. En producción define `NODE_ENV=production`, `BASE_URL` y `PUBLIC_ORIGIN` con la URL HTTPS real.
7. Configura `MP_WEBHOOK_SECRET` en cuanto registres el webhook de Mercado Pago.

El panel ya no usa `ADMIN_TOKEN` ni guarda credenciales administrativas en `localStorage`. El checkout recalcula precios y verifica stock en el servidor antes de crear la preferencia de Mercado Pago.
