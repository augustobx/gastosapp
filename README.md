# GastosApp - Control Financiero PWA

Aplicación Web Progresiva (PWA) moderna para el control inteligente de gastos, sueldo mensual, gastos fijos periódicos e ingresos extra con balance en tiempo real.

Desarrollada para el stack de **NanoLabs** y desplegada en `https://gastosapp.nanoapps.ar`.

## Características Principales

- **Registro Rápido de Gastos**:
  - Asignación automática de la fecha del día (`YYYY-MM-DD`).
  - Campo de monto con teclado numérico formateado.
  - Categorización inteligente (Comida, Servicios, Alquiler, Transporte, Salud, Ocio, etc.).
  - Marcado de **Gasto Fijo**: soporte para duración en días, semanas, meses o permanente.
- **Control de Sueldo e Ingresos**:
  - Definición y edición inmediata del **Sueldo base mensual**.
  - Registro de **Ingresos extra** que impactan directamente sumando al saldo disponible.
- **Balance y Salud Financiera en Vivo**:
  - Saldo Disponible = (Sueldo + Ingresos extra) - (Gastos Fijos + Gastos Variables).
  - Barra de progreso del presupuesto consumido.
  - Indicador de presupuesto diario restante para fin de mes.
  - Desglose estadístico por categoría y comparador Fijos vs Variables.
- **PWA Instalable**:
  - Funciona como aplicación nativa en iOS, Android, Windows y macOS.
  - Service Worker con soporte offline y caché rápido.
- **Persistencia y Despliegue NanoLabs**:
  - Docker Compose integrado a la red compartida `proxy`.
  - Configurado en Nginx Proxy Manager con SSL Let's Encrypt Wildcard `*.nanoapps.ar`.

---
Desarrollado con ❤️ por NanoLabs.
